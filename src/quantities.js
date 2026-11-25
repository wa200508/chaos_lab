// Provenance describes physical quantities separately from their compiled measures.
// Effective source IDs come from symbolic simplification, so a shared contribution
// can disappear when paths meet again.
export function quantityTrace(model,laws,fields,bindings) {
  const result={};
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const incoming=id=>model.edges.filter(e=>e.to===id);
  function observed(tap){
    if(tap.source?.port==='in')return incoming(tap.source.id).find(e=>e.port===(tap.source.inputPort||'x'))?.from;
    return tap.source?.id;
  }
  for(const n of model.nodes.filter(n=>n.type!=='tap')){
    const field=fields[n.id];
    const provider=bindings.get(n.id)?.[0]?.to;
    const declared=n.type==='random'||n.op==='quantity'||n.op==='conditionalNormal';
    const sources=laws[n.id]?.sourceIds || (field?.kind==='born' && field.observable?[field.observable]:[]);
    const inherited=incoming(n.id).filter(e=>!(n.op==='linearSystem'&&e.port.startsWith('unknown'))).flatMap(e=>laws[e.from]?.sourceIds||[]);
    const canceled=laws[n.id]?[...new Set(inherited.filter(id=>!sources.includes(id)))]:[];
    const origin=n.op==='quantity'?(provider?'system':incoming(n.id).some(e=>e.port==='law')?'connected':'unbound'):
      n.op==='conditionalNormal'?'conditional':n.type==='random'?'supplied':'derived';
    result[n.id]={domain:n.domain||(field?.kind==='born'?'space3':field&&!laws[n.id]?'operator':'real'),
      resolved:Boolean(laws[n.id]||field),units:n.units||'',subsystem:n.subsystem||'',declared,origin,sources,canceled};
    if(provider)result[n.id].provider=provider;
    else if(n.op==='quantity')result[n.id].provider=incoming(n.id).find(e=>e.port==='law')?.from;
  }
  for(const tap of model.nodes.filter(n=>n.type==='tap')){
    const target=observed(tap);
    if(nodes.has(target)&&result[target])result[tap.id]={...result[target],observed:target,declared:false};
    else if(laws[tap.id])result[tap.id]={domain:'real',units:'',declared:false,origin:'default',sources:laws[tap.id].sourceIds,canceled:[]};
  }
  return result;
}

// Boundary ports are computed from the actual graph, including observing taps.
export function subsystemBoundary(model,name){
  const members=model.nodes.filter(n=>n.subsystem===name);
  const ids=new Set(members.map(n=>n.id));
  const wires=[...model.edges];
  for(const tap of model.nodes.filter(n=>n.source && n.type==='tap')){
    const source=tap.source;
    const from=source.port==='in'?model.edges.find(e=>e.to===source.id&&e.port===source.inputPort)?.from:source.id;
    if(from)wires.push({from,to:tap.id,port:'observation'});
  }
  return {members,inputs:wires.filter(e=>!ids.has(e.from)&&ids.has(e.to)),outputs:wires.filter(e=>ids.has(e.from)&&!ids.has(e.to))};
}
