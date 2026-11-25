import {makeNode,ENGINE_VERSION} from './engine.js';

export function sharedFurnace(){
  function block(id,op,name,x,y,units,subsystem,params={}){
    const n=makeNode(op,x,y);
    return {...n,id,name,units,subsystem,params:{...n.params,...params}};
  }
  function tap(id,name,from,x,y){
    return {...makeNode('tap',x,y),id,name,source:{id:from,port:'out'}};
  }
  const furnace='Furnace',stock='Incoming stock';
  const nodes=[
    block('temperature','normal','Furnace temperature deviation',0,175,'°C',furnace,{mean:0,sigma:5}),
    block('stockA','normal','Incoming thickness A',0,5,'mm',stock,{mean:10,sigma:.03}),
    block('stockB','normal','Incoming thickness B',0,345,'mm',stock,{mean:10,sigma:.03}),
    block('shiftA','multiply','Thermal expansion A',210,50,'mm',furnace,{b:.01}),
    block('shiftB','multiply','Thermal expansion B',210,300,'mm',furnace,{b:.01}),
    block('partA','add','Finished thickness A',420,50,'mm',furnace),
    block('partB','add','Finished thickness B',420,300,'mm',furnace),
    block('difference','subtract','Thickness difference',650,170,'mm','Inspection'),
    tap('tapA','Finished A','partA',645,0),tap('tapB','Finished B','partB',645,340),
    tap('tapDiff','A − B','difference',880,170)
  ];
  const links=[['temperature','shiftA','x'],['temperature','shiftB','x'],['stockA','partA','x'],
    ['stockB','partB','x'],['shiftA','partA','b'],['shiftB','partB','b'],['partA','difference','x'],['partB','difference','b']];
  return {id:crypto.randomUUID(),name:'Shared furnace',branch:'shared-furnace',engine:ENGINE_VERSION,
    iterations:1,samples:10000,seed:42,nodes,edges:links.map(([from,to,port])=>({from,to,port}))};
}
