import importlib.util
import pathlib
import sys
import subprocess
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '.export-test')
for name,expected in [('square',.5),('difference',1.0),('twelve',.5)]:
    path=root/(name+'.py');spec=importlib.util.spec_from_file_location('fixture_'+name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    source_ids=module.TERMS[module.PAYLOAD['visualizations'][0]['root']]['sourceIds']
    assert len(source_ids)==(1 if name=='square' else 12 if name=='twelve' else 0)
    cdf,bounds,_=module.numeric_descriptor(module.PAYLOAD['visualizations'][0]['root'])
    assert abs(cdf(0 if name=='twelve' else .25)-expected)<1e-10
    if name=='square':
        expression=module.expanded_expression(module.PAYLOAD['visualizations'][0]['root']);assert expression==list(module.VARIABLES.values())[0]**2
    elif name=='difference':assert module.symbolic_cdf(module.PAYLOAD['visualizations'][0]['root'],module.sp.Rational(1,4))==1
    assert len(module.EQUATIONS)>0
output=root/'python-visualization.png'
subprocess.run([sys.executable,str(root/'logistic.py'),'--output',str(output),'--cdf-points','64'],check=True,timeout=120)
assert output.stat().st_size>10000
print('Python exports passed symbolic equations, source identity, analytic CDFs, and visualization rendering.')

import math
spec = importlib.util.spec_from_file_location('hydrogen', root / 'hydrogen.py')
hydrogen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hydrogen)
outputs = hydrogen.PAYLOAD['graph']['outputs']
for node, point, expected in [('radialTap', 1, 1-5*math.exp(-2)), ('insideTap', 0, 5*math.exp(-2))]:
    cdf, _, _ = hydrogen.numeric_descriptor(outputs[node]['root'])
    assert abs(cdf(point)-expected) < 1e-12
