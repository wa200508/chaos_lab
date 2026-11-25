export default String.raw`import argparse
import ast
import functools
import itertools
import math
from pathlib import Path
import sympy as sp

# The serialized DAG is the symbolic system, not a collection of samples.
TERMS = {term['id']: term for term in PAYLOAD['graph']['terms']}
SOURCES = {term['sourceId']: term for term in TERMS.values() if term['kind'] == 'source'}
VARIABLES = {name: sp.Symbol('X_' + PAYLOAD['model'].get('id','anonymous').replace('-','_') + '_' + name, real=True) for name in SOURCES}
REFERENCES = {name: sp.Symbol(name, real=True) for name in TERMS}
MATH = {'sin': sp.sin, 'cos': sp.cos, 'tanh': sp.tanh, 'exp': sp.exp, 'log': sp.log, 'sqrt': sp.sqrt, 'abs': sp.Abs, 'Abs': sp.Abs, 'factorial': sp.factorial, 'gamma': sp.gamma, 'sign': sp.sign}


def parse_math(text, variables=None):
    """Whitelist the exported mathematical syntax; do not eval model strings."""
    variables = variables or {}
    def visit(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return sp.Rational(str(node.value))
        if isinstance(node, ast.Name):
            if node.id in variables: return variables[node.id]
            if node.id == 'pi': return sp.pi
            if node.id in ('e', 'E'): return sp.E
        if isinstance(node, ast.UnaryOp):
            value = visit(node.operand)
            if isinstance(node.op, ast.USub): return -value
            if isinstance(node.op, ast.UAdd): return value
        if isinstance(node, ast.BinOp):
            a, b = visit(node.left), visit(node.right)
            for cls, fn in ((ast.Add, lambda: a+b), (ast.Sub, lambda: a-b), (ast.Mult, lambda: a*b), (ast.Div, lambda: a/b), (ast.Pow, lambda: a**b), (ast.Mod, lambda: sp.Mod(a,b))):
                if isinstance(node.op, cls): return fn()
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in MATH and not node.keywords:
            return MATH[node.func.id](*map(visit, node.args))
        raise ValueError('Unsupported mathematical syntax: ' + ast.dump(node))
    return visit(ast.parse(str(text).replace('^', '**'), mode='eval').body)


def apply_symbolic(term, values):
    op = term['operation']; x, b, r = (values.get(k) for k in ('x', 'b', 'r'))
    if op == 'custom': return parse_math(term['expression'], values)
    if op == 'logistic': return r*x*(1-x)
    if op == 'tent': return sp.Piecewise((r*x, x < sp.Rational(1,2)), (r*(1-x), True))
    if op in MATH: return MATH[op](x)
    if op == 'add': return x+b
    if op == 'subtract': return x-b
    if op == 'multiply': return x*b
    if op == 'divide': return x/b
    if op == 'power': return x**b
    if op == 'modulo': return sp.Mod(x,b)
    if op == 'min': return sp.Min(x,b)
    if op == 'max': return sp.Max(x,b)
    if op == 'clamp': return sp.Min(values['max'], sp.Max(values['min'], x))
    if op == 'combination': return sp.binomial(x,b)
    if op == 'permutation': return sp.factorial(x)/sp.factorial(x-b)
    conditions = {'greater': lambda: x>b, 'less': lambda: x<b, 'equal': lambda: sp.Eq(x,b), 'and': lambda: sp.And(sp.Ne(x,0),sp.Ne(b,0)), 'or': lambda: sp.Or(sp.Ne(x,0),sp.Ne(b,0)), 'not': lambda: sp.Eq(x,0)}
    if op in conditions: return sp.Piecewise((1, conditions[op]()), (0,True))
    if op == 'switch': return sp.Piecewise((values['a'],x>values['p']),(b,True))
    raise ValueError('Unsupported operator: '+op)


def local_expression(term, references):
    if term['kind'] == 'constant': return parse_math(term['value'])
    if term['kind'] == 'source': return VARIABLES[term['sourceId']]
    return apply_symbolic(term, {key: references[value] for key,value in term['inputs'].items()})


EQUATIONS = [sp.Eq(REFERENCES[name], local_expression(term, REFERENCES), evaluate=False) for name,term in TERMS.items()]


def expanded_expression(root, max_operations=20000):
    """Expand references only on explicit request, with a structural size limit."""
    complexity = {}; expressions = {}
    for name,term in TERMS.items():
        children = list(term.get('inputs',{}).values())
        # A custom function may use each argument repeatedly.
        complexity[name] = 1 + 4*sum(complexity[c] for c in children)
        if complexity[name] > max_operations:
            if name == root: raise ValueError('Keep this large system in DAG/equation form, or increase max_operations explicitly.')
            continue
        if any(c not in expressions for c in children): continue
        expressions[name] = local_expression(term, expressions)
    if root not in expressions: raise ValueError('Expansion limit reached; symbolic equations remain available.')
    return expressions[root]


def symbolic_cdf(root, y=None, expand=False):
    """Exact pushforward CDF; shared source identifiers appear only once."""
    y = y if y is not None else sp.Symbol('y', real=True)
    ids = TERMS[root]['sourceIds']
    mapped = expanded_expression(root) if expand else sp.Function('F_'+root)(*[VARIABLES[name] for name in ids])
    if not ids: return sp.Heaviside(y-expanded_expression(root), 1)
    expression = sp.Heaviside(y-mapped, 1)
    for name in ids:
        source=SOURCES[name]; family=source['family']; p={k:parse_math(v) for k,v in source['parameters'].items()}; x=VARIABLES[name]
        if family=='uniform': expression=sp.Integral(expression/(p['max']-p['min']), (x,p['min'],p['max']))
        elif family=='normal': expression=sp.Integral(expression*sp.exp(-(x-p['mean'])**2/(2*p['sigma']**2))/(sp.sqrt(2*sp.pi)*p['sigma']), (x,-sp.oo,sp.oo))
        elif family=='exponential': expression=sp.Integral(expression*p['lambda']*sp.exp(-p['lambda']*x),(x,0,sp.oo))
        elif family=='gamma':
            k, rate = p['shape'], p['lambda']
            density = rate**k * x**(k-1) * sp.exp(-rate*x) / sp.gamma(k)
            expression = sp.Integral(expression*density, (x,0,sp.oo))
        elif family=='beta': expression=sp.Integral(expression*x**(p['a']-1)*(1-x)**(p['b']-1)/sp.beta(p['a'],p['b']),(x,0,1))
        elif family=='bernoulli': expression=sp.Sum(expression*p['p']**x*(1-p['p'])**(1-x),(x,0,1))
        elif family=='poisson': expression=sp.Sum(expression*sp.exp(-p['lambda'])*p['lambda']**x/sp.factorial(x),(x,0,sp.oo))
    return expression


@functools.lru_cache(None)
def constant(root):
    return float(parse_math(TERMS[root]['value']))


@functools.lru_cache(None)
def numeric_function(root):
    term=TERMS[root]
    if term['kind']=='constant': return lambda assignment: constant(root)
    if term['kind']=='source': return lambda assignment: assignment[term['sourceId']]
    symbols={key:sp.Symbol(key,real=True) for key in term['inputs']}
    expression=apply_symbolic(term,symbols)
    fn=sp.lambdify(list(symbols.values()),expression,modules='math',cse=True)
    functions=[numeric_function(value) for value in term['inputs'].values()]
    return lambda assignment: fn(*[f(assignment) for f in functions])


@functools.lru_cache(None)
def source_distribution(name):
    from scipy import stats
    s=SOURCES[name]; p={k:float(parse_math(v)) for k,v in s['parameters'].items()}
    return {'gamma':lambda:stats.gamma(p['shape'],scale=1/p['lambda']), 'uniform':lambda:stats.uniform(p['min'],p['max']-p['min']), 'normal':lambda:stats.norm(p['mean'],p['sigma']), 'exponential':lambda:stats.expon(scale=1/p['lambda']), 'beta':lambda:stats.beta(p['a'],p['b']), 'bernoulli':lambda:stats.bernoulli(p['p']), 'poisson':lambda:stats.poisson(p['lambda'])}[s['family']]()


@functools.lru_cache(None)
def numeric_descriptor(root):
    """Numerical work begins here, only when a visualization requests a law."""
    from scipy import special, integrate
    term=TERMS[root]
    if term['kind']=='constant':
        value=constant(root); return (lambda y:float(y>=value), (value,value), 'point mass')
    if term['kind']=='source':
        name=term['sourceId']; distribution=source_distribution(name);family=SOURCES[name]['family'];p={k:float(parse_math(v)) for k,v in SOURCES[name]['parameters'].items()}
        functions={'uniform':lambda y:min(1,max(0,(y-p['min'])/(p['max']-p['min']))),'normal':lambda y:special.ndtr((y-p['mean'])/p['sigma']),'exponential':lambda y:0.0 if y<=0 else -math.expm1(-p['lambda']*y),'beta':lambda y:special.betainc(p['a'],p['b'],min(1,max(0,y)))}
        return (functions.get(family,distribution.cdf), tuple(distribution.support()), 'source CDF')
    ids=term['sourceIds']; linear=term.get('linear')
    if linear and ids and all(SOURCES[name]['family']=='normal' for name in ids):
        mean=float(parse_math(linear['offset']))+sum(float(parse_math(linear['coefficients'][name]))*float(parse_math(SOURCES[name]['parameters']['mean'])) for name in ids)
        variance=sum((float(parse_math(linear['coefficients'][name]))*float(parse_math(SOURCES[name]['parameters']['sigma'])))**2 for name in ids)
        return (lambda y:special.ndtr((y-mean)/math.sqrt(variance)),(-math.inf,math.inf),'symbolically derived Gaussian CDF')
    if linear and ids and all(SOURCES[name]['family']=='uniform' for name in ids):
        bounds=[sorted(float(parse_math(linear['coefficients'][name]))*float(parse_math(SOURCES[name]['parameters'][k])) for k in ('min','max')) for name in ids]
        lo=float(parse_math(linear['offset']))+sum(v[0] for v in bounds); widths=[v[1]-v[0] for v in bounds]; hi=lo+sum(widths); n=len(ids)
        denominator=math.factorial(n)*math.prod(widths)
        subsets=[(sum(widths[i] for i in range(n) if mask>>i&1),(-1)**mask.bit_count()) for mask in range(2**n)]
        def cdf(y):
            if y<=lo:return 0.0
            if y>=hi:return 1.0
            return min(1,max(0,sum(sign*max(0,y-lo-shift)**n for shift,sign in subsets)/denominator))
        return cdf,(lo,hi),'symbolically derived uniform-sum CDF'
    if not ids:
        value=numeric_function(root)({});return lambda y:float(y>=value),(value,value),'point mass'
    if all(SOURCES[name]['family'] in ('bernoulli','poisson') for name in ids):
        axes=[]
        for name in ids:
            dist=source_distribution(name); end=1 if SOURCES[name]['family']=='bernoulli' else int(dist.ppf(1-1e-12)); axes.append([(i,dist.pmf(i)) for i in range(end+1)])
        atoms=[]
        if math.prod(len(axis) for axis in axes)>65536:raise ValueError('PMF visualization budget exceeded; symbolic law retained.')
        for values in itertools.product(*axes): atoms.append((numeric_function(root)(dict(zip(ids,[v[0] for v in values]))),math.prod(v[1] for v in values)))
        total=sum(p for _,p in atoms)
        return lambda y:sum(p for x,p in atoms if x<=y)/total,(min(x for x,_ in atoms),max(x for x,_ in atoms)),'joint finite PMF (Poisson tails truncated only for rendering)'
    inputs=term['inputs']; unary='x' in inputs and all(key=='x' or TERMS[value]['kind']=='constant' for key,value in inputs.items())
    if unary:
        parent,bounds,_=numeric_descriptor(inputs['x']); lo,hi=bounds; op=term['operation']; values={k:constant(v) for k,v in inputs.items() if k!='x'}
        if op=='less' and TERMS[inputs['x']].get('family')=='gamma':
            inside=parent(values['b'])
            return lambda y:0.0 if y<0 else 1-inside if y<1 else 1.0,(0,1),'Gamma threshold probability'
        if op in ('add','subtract','multiply','divide'):
            b=values.get('b'); a=b if op=='multiply' else 1/b if op=='divide' else 1; shift=b if op=='add' else -b if op=='subtract' else 0
            if a==0:return lambda y:float(y>=shift),(shift,shift),'point mass'
            return lambda y:parent((y-shift)/a) if a>0 else 1-parent((y-shift)/a),tuple(sorted((a*lo+shift,a*hi+shift))),'affine CDF'
        if op in ('logistic','tent'):
            r=values['r']; peak=r/(4 if op=='logistic' else 2)
            if r==0:return lambda y:float(y>=0),(0,0),'point mass'
            forward=lambda x:r*x*(1-x) if op=='logistic' else r*min(x,1-x)
            candidates=[forward(lo),forward(hi)]+([peak] if lo<=.5<=hi else [])
            def cdf(y):
                if y<min(candidates):return 0.0
                if y>=max(candidates):return 1.0
                q=math.sqrt(max(0,1-4*y/r)) if op=='logistic' else None
                a,b=((1-q)/2,(1+q)/2) if q is not None else (y/r,1-y/r)
                return min(1,max(0,parent(a)+1-parent(b) if r>0 else parent(b)-parent(a)))
            return cdf,(min(candidates),max(candidates)),'analytic inverse-branch CDF'
        if op=='power' and values['b']>0:
            power=values['b']
            if power.is_integer() and int(power)%2==0:
                return lambda y:0.0 if y<0 else parent(y**(1/power))-parent(-(y**(1/power))),(0 if lo<=0<=hi else min(lo**power,hi**power),max(lo**power,hi**power)),'multi-branch power CDF'
            if lo>=0 or power.is_integer():return lambda y:parent(math.copysign(abs(y)**(1/power),y)),(lo**power,hi**power),'monotone power CDF'
        transforms={'exp':(math.exp,math.log),'log':(math.log,math.exp),'sqrt':(math.sqrt,lambda y:y*y),'tanh':(math.tanh,math.atanh)}
        if op in transforms:
            f,inverse=transforms[op]
            if op in ('log','sqrt') and lo<0:raise ValueError(op+' input leaves its real domain; symbolic law retained.')
            bounds=(f(lo) if not(op=='log' and lo==0) else -math.inf,f(hi))
            return lambda y:0.0 if y<bounds[0] else 1.0 if y>=bounds[1] else parent(inverse(y)),bounds,'analytic monotone CDF'
        if op=='abs':return lambda y:0.0 if y<0 else parent(y)-parent(-y),(0 if lo<=0<=hi else min(abs(lo),abs(hi)),max(abs(lo),abs(hi))),'two-branch absolute-value CDF'
        if op in ('min','max','clamp'):
            lower=-math.inf if op=='min' else values['b'] if op=='max' else values['min']; upper=math.inf if op=='max' else values['b'] if op=='min' else values['max']
            return lambda y:0.0 if y<lower else 1.0 if y>=upper else parent(y),(min(upper,max(lower,lo)),min(upper,max(lower,hi))),'mixed CDF including boundary atoms'
    if len(ids)>3:raise ValueError('The exact joint integral is retained; numerical visualization supports at most three independent source dimensions.')
    fn=numeric_function(root); distributions=[source_distribution(name) for name in ids]
    # Deterministic probability quadrature, never draws from source distributions.
    def cdf(y):
        def integrand(*coordinates):
            assignment={name:dist.ppf(u) for name,dist,u in zip(ids,distributions,coordinates)}
            return float(fn(assignment)<=y)
        value,_=integrate.nquad(integrand,[(0,1)]*len(ids),opts={'epsabs':1e-5,'limit':100})
        return min(1,max(0,value))
    # Numerical bounds are determined for visualization only, using fixed quantiles.
    ranges=[[dist.ppf(u) for u in (.000001,.25,.5,.75,.999999)] for dist in distributions]
    values=[fn(dict(zip(ids,point))) for point in itertools.product(*ranges)]
    return cdf,(min(values),max(values)),'numerical joint-CDF quadrature; finite plotting window'


def orbital_rate(tap):
    term = TERMS[tap['root']]
    if tap.get('orbitalCloud') and term.get('family') == 'gamma' and parse_math(term['parameters']['shape']) == 3:
        return float(parse_math(term['parameters']['lambda']))


def plot_orbital(axes, rate, seed, count):
    import numpy as np
    from scipy.ndimage import gaussian_filter
    from scipy.special import gammaincinv
    from matplotlib.colors import LinearSegmentedColormap, PowerNorm

    rng = np.random.default_rng(int(seed) % 2**32)
    radius = gammaincinv(3, rng.random(count))/rate
    cosine = rng.uniform(-1, 1, count)
    phi = rng.uniform(0, 2*np.pi, count)
    transverse = radius*np.sqrt(1-cosine**2)
    counts, _, _ = np.histogram2d(transverse*np.cos(phi), transverse*np.sin(phi),
                                  bins=192, range=[[-4,4],[-4,4]])
    centers = (np.arange(192)+0.5)*8/192-4
    density = np.exp(-rate*np.hypot(centers[:,None], centers[None,:]))
    palette = LinearSegmentedColormap.from_list('orbital', ['#060a17','#141638','#33266d','#6043ac','#5a90d3','#82dbe7','#edfaea'])
    for ax, field, title in zip(axes, [gaussian_filter(counts.T, .8), density],
                                ['Projected detections', 'Spatial density · z = 0']):
        ax.imshow(field, origin='lower', extent=(-4,4,-4,4), cmap=palette, norm=PowerNorm(.5))
        ax.plot(0,0,'o',ms=3,mfc='none',mec='#efdfb0')
        ax.set(title=title, xlabel='x (a₀)', ylabel='y (a₀)', aspect='equal')


def meridian_panels(axes, spec, count, seed):
    import numpy as np
    r,u=sp.symbols('r u',real=True)
    amplitude=sp.lambdify((r,u), parse_math(spec['expression'],{'r':r,'u':u}), 'numpy')
    extent=spec['extent']
    grid=(np.arange(192)+.5)*2*extent/192-extent
    x,z=np.meshgrid(grid,grid); radius=np.hypot(x,z)
    density=abs(amplitude(radius,z/radius))**2
    rr=(np.arange(256)+.5)*2*extent/256
    uu=(np.arange(128)+.5)*2/128-1
    mass=rr[:,None]**2*abs(amplitude(rr[:,None],uu[None,:]))**2*np.ones((1,128))
    rng=np.random.default_rng(int(seed)%2**32)
    cells=rng.choice(mass.size,count,p=(mass/mass.sum()).ravel())
    radius=(cells//128+rng.random(count))*2*extent/256
    cosine=(cells%128+rng.random(count))*2/128-1
    x=radius*np.sqrt(1-cosine**2)*np.cos(rng.uniform(0,2*np.pi,count))
    projected=np.histogram2d(radius*cosine,x,bins=192,range=[[-extent,extent]]*2)[0]
    for ax,field,title in zip(axes,[density,projected],['Meridian density','Projected detections']):
        ax.imshow(np.sqrt(field),origin='lower',extent=(-extent,extent,-extent,extent),cmap='magma')
        ax.set(title=title,xlabel='x (a₀)',ylabel='z (a₀)')


def plot_visualizations(output=None,bins=34,cdf_points=128):
    import numpy as np
    import matplotlib.pyplot as plt
    from scipy.optimize import brentq
    taps=[tap for tap in PAYLOAD['visualizations'] if tap.get('root')]
    if not taps: print('No attached visualization nodes.');return
    cloud_rates = [rate for tap in taps if (rate := orbital_rate(tap)) is not None]
    fields = [t['meridian'] for t in taps if t.get('meridian')]
    rows = len(taps) + len(cloud_rates) + len(fields)
    fig,axes=plt.subplots(rows,2,figsize=(12,3.3*rows),squeeze=False)
    for row,tap in enumerate(taps):
        cdf,bounds,method=numeric_descriptor(tap['root']);lo,hi=bounds
        if not math.isfinite(lo):
            lower=-1.0
            while cdf(lower)>1e-8:lower*=2
            lo=brentq(lambda x:cdf(x)-1e-8,lower,max(0.0,hi) if math.isfinite(hi) else 1.0)
        if not math.isfinite(hi):
            upper=1.0
            while cdf(upper)<1-1e-8:upper*=2
            hi=brentq(lambda x:cdf(x)-(1-1e-8),min(lo,0.0),upper)
        if lo==hi:lo-=.5;hi+=.5
        edges=np.linspace(lo,hi,bins+1); probabilities=np.maximum(0,np.diff([cdf(x) for x in edges]));probabilities[0]+=max(0,cdf(edges[0]));probabilities/=probabilities.sum()
        axes[row,0].bar(edges[:-1],probabilities,width=np.diff(edges),align='edge',color='#83a77e');axes[row,0].set_ylabel('Probability per bin');axes[row,0].set_title(tap['name']+' — final distribution')
        points=np.linspace(lo,hi,cdf_points);axes[row,1].plot(points,[cdf(x) for x in points],color='#327c60');axes[row,1].set_ylim(-.02,1.02);axes[row,1].set_title('CDF · '+method);axes[row,1].set_ylabel('P(Y ≤ y)')
        for axis in axes[row]:axis.grid(alpha=.15);axis.set_xlabel('Port value')
    for row,rate in enumerate(cloud_rates, start=len(taps)):
        plot_orbital(axes[row],rate,PAYLOAD['model'].get('seed',42),PAYLOAD['model'].get('samples',10000))
    for row,spec in enumerate(fields,start=len(taps)+len(cloud_rates)):
        meridian_panels(axes[row],spec,PAYLOAD['model']['samples'],PAYLOAD['model']['seed'])
    fig.suptitle(PAYLOAD['model']['name']+' · symbolic laws, numerical visualization',fontsize=12);fig.tight_layout()
    if output:fig.savefig(output,dpi=160);plt.close(fig);print('Saved '+str(output))
    else:plt.show()


def main():
    parser=argparse.ArgumentParser(description='Exported Chaos Lab symbolic distribution system')
    parser.add_argument('--no-plot',action='store_true');parser.add_argument('--show-symbolic',action='store_true');parser.add_argument('--output',type=Path);parser.add_argument('--bins',type=int,default=34);parser.add_argument('--cdf-points',type=int,default=128);args=parser.parse_args()
    print(PAYLOAD['model']['name']+' | '+PAYLOAD['graph']['engine'])
    print(f'{len(SOURCES)} independent source(s), {len(EQUATIONS)} symbolic relations, {len(PAYLOAD["visualizations"])} visualization node(s).')
    if args.show_symbolic:
        for equation in EQUATIONS:print(equation)
        for tap in PAYLOAD['visualizations']:
            if tap.get('root'):print(tap['name'],symbolic_cdf(tap['root']))
    if not args.no_plot:plot_visualizations(args.output,args.bins,args.cdf_points)

if __name__=='__main__':main()
`;
