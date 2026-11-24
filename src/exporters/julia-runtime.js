export default String.raw`using Symbolics, Distributions, QuadGK

const TERMS = Dict(String(t["id"]) => t for t in PAYLOAD["graph"]["terms"])
const SOURCES = Dict(String(t["sourceId"]) => t for t in values(TERMS) if t["kind"] == "source")
const SOURCE_VARIABLES = Dict(name => Symbolics.variable(Symbol("X_" * get(PAYLOAD["model"],"id","anonymous") * "_" * name)) for name in keys(SOURCES))
const REFERENCES = Dict(name => Symbolics.variable(Symbol(name)) for name in keys(TERMS))

# This structured operator is the exact joint pushforward CDF. Its map is defined
# by EQUATIONS; each source identifier is integrated once, even on shared wires.
struct PushforwardCDF
    root::String
    variable::Any
    source_ids::Vector{String}
    measures::Vector{Any}
end
Base.show(io::IO, law::PushforwardCDF) = print(io, "P(F_", law.root, "(", join(law.source_ids, ", "), ") ≤ ", law.variable, ") over joint product measure")

function parse_math(text, variables=Dict{Symbol,Any}())
    function visit(node)
        node isa Number && return node
        if node isa Symbol
            haskey(variables,node) && return variables[node]
            node == :pi && return π
            node in (:e,:E) && return Base.MathConstants.e
        end
        if node isa Expr && node.head == :call
            op=node.args[1]; args=map(visit,node.args[2:end])
            op==:+ && return +(args...)
            op==:- && return -(args...)
            op==:* && return *(args...)
            op==:/ && return all(a->a isa Integer,args) ? args[1]//args[2] : /(args...)
            op==:^ && return ^(args...)
            allowed=Dict(:sin=>sin,:cos=>cos,:tanh=>tanh,:exp=>exp,:log=>log,:sqrt=>sqrt,:abs=>abs,:Abs=>abs)
            haskey(allowed,op) && return allowed[op](args...)
        end
        error("Unsupported mathematical syntax: $node")
    end
    visit(Meta.parse(String(text)))
end

const OP_CODES=Dict(op=>i for (i,op) in enumerate(["modulo","min","max","clamp","factorial","combination","permutation","greater","less","equal","and","or","not","switch","tent"]))
function special_block(code,x,b,r,lower,upper,p,a)
    op=first(key for (key,value) in OP_CODES if value==code)
    op=="modulo" && return mod(x,b)
    op=="min" && return min(x,b)
    op=="max" && return max(x,b)
    op=="clamp" && return clamp(x,lower,upper)
    if op in ("factorial","combination","permutation")
        (isinteger(x) && x>=0) || error("Combinatorics requires nonnegative integer-valued inputs")
        op=="factorial" && return factorial(big(Int(x)))
        (isinteger(b) && 0<=b<=x) || error("Invalid combinatorial operand")
        op=="combination" && return binomial(big(Int(x)),Int(b))
        return factorial(big(Int(x)))÷factorial(big(Int(x-b)))
    end
    op=="greater" && return Int(x>b)
    op=="less" && return Int(x<b)
    op=="equal" && return Int(x==b)
    op=="and" && return Int(x!=0 && b!=0)
    op=="or" && return Int(x!=0 || b!=0)
    op=="not" && return Int(x==0)
    op=="switch" && return x>p ? a : b
    op=="tent" && return x<1//2 ? r*x : r*(1-x)
    error("Unknown special operator")
end
@register_symbolic special_block(code,x,b,r,lower,upper,p,a)

function apply_math(term, v)
    op=term["operation"]; x=get(v,"x",0); b=get(v,"b",0); r=get(v,"r",0)
    op=="custom" && return parse_math(term["expression"],Dict(Symbol(k)=>a for (k,a) in v))
    op=="logistic" && return r*x*(1-x)
    op=="add" && return x+b
    op=="subtract" && return x-b
    op=="multiply" && return x*b
    op=="divide" && return x/b
    op=="power" && return x^b
    functions=Dict("sin"=>sin,"cos"=>cos,"tanh"=>tanh,"exp"=>exp,"log"=>log,"sqrt"=>sqrt,"abs"=>abs)
    haskey(functions,op) && return functions[op](x)
    return special_block(OP_CODES[op],x,b,r,get(v,"min",0),get(v,"max",1),get(v,"p",1//2),get(v,"a",0))
end

function local_expression(term, references)
    term["kind"]=="constant" && return parse_math(term["value"])
    term["kind"]=="source" && return SOURCE_VARIABLES[term["sourceId"]]
    apply_math(term,Dict(k=>references[root] for (k,root) in term["inputs"]))
end

const EQUATIONS = [REFERENCES[t["id"]] ~ local_expression(t,REFERENCES) for t in PAYLOAD["graph"]["terms"]]
function symbolic_cdf(root)
    ids=String.(TERMS[root]["sourceIds"])
    PushforwardCDF(root,Symbolics.variable(:y),ids,[SOURCES[name] for name in ids])
end

function numeric_value(root, assignment, cache=Dict{String,Float64}())
    haskey(cache,root) && return cache[root]
    term=TERMS[root]
    value=term["kind"]=="constant" ? Float64(parse_math(term["value"])) : term["kind"]=="source" ? assignment[term["sourceId"]] : apply_math(term,Dict(k=>numeric_value(t,assignment,cache) for (k,t) in term["inputs"]))
    result=Float64(value);isfinite(result)||error("Law leaves finite real domain at $root")
    cache[root]=result;result
end

const SOURCE_CACHE=Dict{String,Any}()
function source_distribution(name)
    get!(SOURCE_CACHE,name) do
        source=SOURCES[name];p=Dict(k=>Float64(parse_math(v)) for (k,v) in source["parameters"]);family=source["family"]
        family=="uniform" && return Uniform(p["min"],p["max"])
        family=="normal" && return Normal(p["mean"],p["sigma"])
        family=="exponential" && return Exponential(1/p["lambda"])
        family=="gamma" && return Gamma(p["shape"],inv(p["lambda"]))
        family=="beta" && return Beta(p["a"],p["b"])
        family=="bernoulli" && return Bernoulli(p["p"])
        family=="poisson" && return Poisson(p["lambda"])
        error("Unknown distribution")
    end
end

const DESCRIPTORS=Dict{String,Any}()
function numeric_descriptor(root)
    get!(DESCRIPTORS,root) do
        term=TERMS[root];kind=term["kind"]
        if kind=="constant"
            value=Float64(parse_math(term["value"]));return (cdf=y->Float64(y>=value),bounds=(value,value),method="point mass")
        end
        if kind=="source"
            d=source_distribution(term["sourceId"]);return (cdf=y->cdf(d,y),bounds=(Float64(minimum(d)),Float64(maximum(d))),method="source CDF")
        end
        ids=String.(term["sourceIds"]);linear=get(term,"linear",nothing)
        if linear!==nothing && !isempty(ids) && all(SOURCES[n]["family"]=="normal" for n in ids)
            coefficients=Dict(n=>Float64(parse_math(linear["coefficients"][n])) for n in ids)
            μ=Float64(parse_math(linear["offset"]))+sum(coefficients[n]*mean(source_distribution(n)) for n in ids)
            σ²=sum(coefficients[n]^2*var(source_distribution(n)) for n in ids);d=Normal(μ,sqrt(σ²))
            return (cdf=y->cdf(d,y),bounds=(-Inf,Inf),method="symbolically derived Gaussian CDF")
        end
        if linear!==nothing && !isempty(ids) && all(SOURCES[n]["family"]=="uniform" for n in ids)
            intervals=[sort(Float64(parse_math(linear["coefficients"][n])).*[minimum(source_distribution(n)),maximum(source_distribution(n))]) for n in ids]
            lo=Float64(parse_math(linear["offset"]))+sum(v[1] for v in intervals);widths=[v[2]-v[1] for v in intervals];hi=lo+sum(widths);dimension=length(ids)
            dimension<=12||error("Uniform convolution visualization dimension limit; symbolic law retained")
            subsets=[(shift=sum(widths[i] for i in 1:dimension if mask & (1<<(i-1)) != 0;init=0.0),sign=(-1)^count_ones(mask)) for mask in 0:(2^dimension-1)]
            denominator=Float64(factorial(big(dimension)))*prod(widths)
            return (cdf=y->y<=lo ? 0.0 : y>=hi ? 1.0 : clamp(sum(s.sign*max(0,y-lo-s.shift)^dimension for s in subsets)/denominator,0,1),bounds=(lo,hi),method="symbolically derived uniform-sum CDF")
        end
        if isempty(ids)
            value=numeric_value(root,Dict{String,Float64}());return (cdf=y->Float64(y>=value),bounds=(value,value),method="point mass")
        end
        if all(SOURCES[n]["family"] in ("bernoulli","poisson") for n in ids)
            axes=[[(Float64(k),pdf(source_distribution(n),k)) for k in 0:(SOURCES[n]["family"]=="bernoulli" ? 1 : Int(quantile(source_distribution(n),1-1e-12)))] for n in ids]
            prod(length.(axes))<=65536||error("Joint PMF visualization budget exceeded; symbolic law retained")
            atoms=[(numeric_value(root,Dict(n=>v[1] for (n,v) in zip(ids,values))),prod(v[2] for v in values)) for values in Iterators.product(axes...)];total=sum(v[2] for v in atoms)
            return (cdf=y->sum(p for (x,p) in atoms if x<=y;init=0.0)/total,bounds=extrema(first.(atoms)),method="joint PMF (Poisson plotting tails truncated)")
        end
        inputs=term["inputs"];op=term["operation"];unary=haskey(inputs,"x")&&all(k=="x"||TERMS[t]["kind"]=="constant" for (k,t) in inputs)
        if unary
            parent=numeric_descriptor(inputs["x"]);lo,hi=parent.bounds;p=Dict(k=>Float64(parse_math(TERMS[t]["value"])) for (k,t) in inputs if k!="x")
            if op=="less" && get(TERMS[inputs["x"]],"family",nothing)=="gamma"
                inside=parent.cdf(p["b"])
                return (cdf=y->y<0 ? 0.0 : y<1 ? 1-inside : 1.0,bounds=(0.0,1.0),method="Gamma threshold probability")
            end
            if op in ("add","subtract","multiply","divide")
                b=p["b"];a=op=="multiply" ? b : op=="divide" ? 1/b : 1;shift=op=="add" ? b : op=="subtract" ? -b : 0
                a==0&&return (cdf=y->Float64(y>=shift),bounds=(shift,shift),method="point mass")
                bounds=sort([a*lo+shift,a*hi+shift]);return (cdf=y->a>0 ? parent.cdf((y-shift)/a) : 1-parent.cdf((y-shift)/a),bounds=(bounds[1],bounds[2]),method="affine CDF")
            end
            if op in ("logistic","tent")
                r=p["r"];peak=r/(op=="logistic" ? 4 : 2)
                r==0&&return (cdf=y->Float64(y>=0),bounds=(0.0,0.0),method="point mass")
                forward=x->op=="logistic" ? r*x*(1-x) : r*min(x,1-x);values=[forward(lo),forward(hi)];lo<=.5<=hi&&push!(values,peak);bounds=extrema(values)
                function transformed(y)
                    y<bounds[1]&&return 0.0;y>=bounds[2]&&return 1.0
                    if op=="logistic";q=sqrt(max(0,1-4*y/r));a=(1-q)/2;b=(1+q)/2;else;a=y/r;b=1-y/r;end
                    clamp(r>0 ? parent.cdf(a)+1-parent.cdf(b) : parent.cdf(b)-parent.cdf(a),0,1)
                end
                return (cdf=transformed,bounds=bounds,method="analytic inverse-branch CDF")
            end
            if op=="power"&&p["b"]>0
                exponent=p["b"]
                if isinteger(exponent)&&iseven(Int(exponent))
                    bounds=(lo<=0<=hi ? 0.0 : min(lo^exponent,hi^exponent),max(lo^exponent,hi^exponent));return (cdf=y->y<0 ? 0.0 : parent.cdf(y^(1/exponent))-parent.cdf(-y^(1/exponent)),bounds=bounds,method="multi-branch power CDF")
                elseif lo>=0||isinteger(exponent)
                    return (cdf=y->parent.cdf(sign(y)*abs(y)^(1/exponent)),bounds=(lo^exponent,hi^exponent),method="monotone power CDF")
                end
            end
            transforms=Dict("exp"=>(exp,log),"log"=>(log,exp),"sqrt"=>(sqrt,x->x^2),"tanh"=>(tanh,atanh))
            if haskey(transforms,op)
                op in ("log","sqrt")&&lo<0&&error("Real domain violation; symbolic law retained")
                f,inverse=transforms[op];bounds=(f(lo),f(hi));return (cdf=y->y<bounds[1] ? 0.0 : y>=bounds[2] ? 1.0 : parent.cdf(inverse(y)),bounds=bounds,method="analytic monotone CDF")
            end
            if op=="abs";return (cdf=y->y<0 ? 0.0 : parent.cdf(y)-parent.cdf(-y),bounds=(lo<=0<=hi ? 0.0 : min(abs(lo),abs(hi)),max(abs(lo),abs(hi))),method="two-branch absolute-value CDF");end
            if op in ("min","max","clamp")
                lower=op=="min" ? -Inf : op=="max" ? p["b"] : p["min"];upper=op=="max" ? Inf : op=="min" ? p["b"] : p["max"]
                return (cdf=y->y<lower ? 0.0 : y>=upper ? 1.0 : parent.cdf(y),bounds=(clamp(lo,lower,upper),clamp(hi,lower,upper)),method="mixed CDF with boundary atoms")
            end
        end
        length(ids)<=3||error("Exact symbolic joint integral retained; visualization currently supports up to three source dimensions")
        distributions=[source_distribution(n) for n in ids]
        function integrated_cdf(y)
            coordinates=zeros(length(ids))
            function integrate_dimension(i)
                if i>length(ids)
                    assignment=Dict(n=>quantile(d,u) for (n,d,u) in zip(ids,distributions,coordinates));return Float64(numeric_value(root,assignment)<=y)
                end
                result=quadgk(u->begin
                    coordinates[i]=u;integrate_dimension(i+1)
                end,0.0,1.0;atol=1e-5)
                result[1]
            end
            clamp(integrate_dimension(1),0,1)
        end
        ranges=[[quantile(d,u) for u in (1e-6,.25,.5,.75,1-1e-6)] for d in distributions]
        values=[numeric_value(root,Dict(zip(ids,point))) for point in Iterators.product(ranges...)]
        (cdf=integrated_cdf,bounds=extrema(values),method="numerical joint-CDF quadrature; finite plotting window")
    end
end

if !("--no-plot" in ARGS)
    import Plots
end

function plot_visualizations(output=nothing;bins=34,cdf_points=128)
    output!==nothing&&(ENV["GKSwstype"]="100")
    taps=[tap for tap in PAYLOAD["visualizations"] if get(tap,"root",nothing)!==nothing]
    isempty(taps)&&return println("No attached visualization nodes")
    panels=Any[]
    for tap in taps
        d=numeric_descriptor(tap["root"]);lo,hi=d.bounds
        # Infinite plotting windows are truncated only at visualization time.
        if !isfinite(lo);lo=-1.0;while d.cdf(lo)>1e-8;lo*=2;end;end
        if !isfinite(hi);hi=1.0;while d.cdf(hi)<1-1e-8;hi*=2;end;end
        lo==hi&&((lo,hi)=(lo-.5,hi+.5))
        edges=collect(range(lo,hi;length=bins+1));mass=max.(0,diff(d.cdf.(edges)));mass[1]+=max(0,d.cdf(lo));mass./=sum(mass)
        push!(panels,Plots.bar((edges[1:end-1]+edges[2:end])/2,mass;bar_width=(hi-lo)/bins,color="#83a77e",legend=false,title=tap["name"]*" — final distribution",xlabel="Port value",ylabel="Probability per bin"))
        values=range(lo,hi;length=cdf_points)
        push!(panels,Plots.plot(values,d.cdf.(values);color="#327c60",legend=false,title="CDF · "*d.method,xlabel="Port value",ylabel="P(Y ≤ y)",ylims=(-.02,1.02)))
    end
    figure=Plots.plot(panels...;layout=(length(taps),2),size=(1200,330*length(taps)))
    output===nothing ? display(figure) : Plots.savefig(figure,output)
end

function main()
    println(PAYLOAD["model"]["name"]," | ",PAYLOAD["graph"]["engine"])
    println(length(SOURCES)," independent source(s), ",length(EQUATIONS)," symbolic relations, ",length(PAYLOAD["visualizations"])," visualization node(s).")
    if "--show-symbolic" in ARGS
        foreach(println,EQUATIONS);foreach(tap->get(tap,"root",nothing)===nothing||println(tap["name"],": ",symbolic_cdf(tap["root"])),PAYLOAD["visualizations"])
    end
    if !("--no-plot" in ARGS)
        index=findfirst(==("--output"),ARGS);output=index===nothing ? nothing : ARGS[index+1]
        plot_visualizations(output)
    end
end
abspath(PROGRAM_FILE) == (@__FILE__) && main()
`;
