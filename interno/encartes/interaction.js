let pendingKonva;
async function loadKonva(){
 if(globalThis.Konva)return globalThis.Konva;
 if(!pendingKonva)pendingKonva=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='./assets/vendor/konva/konva-10.9.0.min.js';
  script.onload=()=>globalThis.Konva?resolve(globalThis.Konva):reject(Error('Não foi possível iniciar os controles da arte.'));
  script.onerror=()=>{script.remove();reject(Error('Não foi possível carregar os controles da arte. Recarregue a página.'));};
  document.head.append(script);
 }).catch(error=>{pendingKonva=null;throw error;});
 return pendingKonva;
}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function transformedGeometry(element,transform,design){
 const width=clamp(element.width*Math.abs(transform.scaleX),1,design.width);
 const height=clamp(element.height*Math.abs(transform.scaleY),1,design.height);
 if(![width,height,transform.centerX,transform.centerY,transform.rotation].every(Number.isFinite))throw Error('Transformação inválida.');
 return {x:clamp(transform.centerX-width/2,0,design.width-width),y:clamp(transform.centerY-height/2,0,design.height-height),width,height,
  rotation:((transform.rotation%360)+540)%360-180,flipX:transform.scaleX<0,flipY:transform.scaleY<0};
}

/** Konva owns hit testing and transform handles; artwork and exports share renderer.js. */
export async function createCanvasInteraction({host,onSelect,onChange,onEdit}){
 const Konva=await loadKonva();
 if(!host.isConnected)return null;
 host.onpointerdown=()=>host.closest('.flyer-stage')?.focus({preventScroll:true});
 const stage=new Konva.Stage({container:host,width:1,height:1});
 const layer=new Konva.Layer();stage.add(layer);
 const transformer=new Konva.Transformer({borderStroke:'#3574f0',anchorStroke:'#3574f0',anchorFill:'#fff',anchorCornerRadius:2,rotationSnaps:[0,45,90,135,180,225,270,315],flipEnabled:false,keepRatio:false,padding:0,enabledAnchors:['top-left','top-center','top-right','middle-left','middle-right','bottom-left','bottom-center','bottom-right'],boundBoxFunc:(oldBox,next)=>Math.abs(next.width)<4||Math.abs(next.height)<4?oldBox:next});
 layer.add(transformer);
 const nodes=new Map();let design,selection,active=false,destroyed=false;
 const select=id=>{selection=id;const node=nodes.get(id),element=design?.elements.find(e=>e.id===id);transformer.nodes(node&&!element.hidden?[node]:[]);transformer.resizeEnabled(Boolean(element&&!element.locked));transformer.rotateEnabled(Boolean(element&&!element.locked));transformer.moveToTop();layer.batchDraw();};
 stage.on('click tap',event=>{if(event.target===stage){select(null);onSelect(null);}});
 const sync=(next,id,scale)=>{
  if(destroyed||active)return;
  design=next;selection=id;stage.size({width:Math.round(next.width*scale),height:Math.round(next.height*scale)});stage.scale({x:scale,y:scale});
  for(const [key,node] of nodes)if(!next.elements.some(e=>e.id===key)){node.destroy();nodes.delete(key);}
  next.elements.forEach((element,index)=>{
   let node=nodes.get(element.id);
   if(!node){
    node=new Konva.Rect({fill:'rgba(0,0,0,0)',id:element.id});nodes.set(element.id,node);layer.add(node);
    node.on('mousedown touchstart',()=>{select(element.id);onSelect(element.id);});
    node.on('dblclick dbltap',()=>onEdit(element.id));
    node.on('dragstart transformstart',()=>{active=true;});
    const change=commit=>{
     const current=design.elements.find(e=>e.id===element.id);if(!current||current.locked)return;
     const patch=transformedGeometry(current,{centerX:node.x(),centerY:node.y(),scaleX:node.scaleX(),scaleY:node.scaleY(),rotation:node.rotation()},design);
     // The node's intrinsic dimensions stay fixed throughout one gesture.
     patch.width=clamp(node.width()*Math.abs(node.scaleX()),1,design.width);
     patch.height=clamp(node.height()*Math.abs(node.scaleY()),1,design.height);
     patch.x=clamp(node.x()-patch.width/2,0,design.width-patch.width);patch.y=clamp(node.y()-patch.height/2,0,design.height-patch.height);
     if(commit)active=false;
     onChange(element.id,patch,commit);
    };
    node.on('dragmove transform',()=>change(false));node.on('dragend transformend',()=>change(true));
    node.on('mouseenter',()=>{host.style.cursor=design.elements.find(e=>e.id===element.id)?.locked?'default':'move';});
    node.on('mouseleave',()=>{host.style.cursor='default';});
   }
   node.setAttrs({x:element.x+element.width/2,y:element.y+element.height/2,width:element.width,height:element.height,offsetX:element.width/2,offsetY:element.height/2,rotation:element.rotation||0,scaleX:element.flipX?-1:1,scaleY:element.flipY?-1:1,draggable:!element.locked,visible:!element.hidden});
   node.zIndex(index);
  });
  transformer.anchorSize(10/scale);transformer.anchorStrokeWidth(1/scale);transformer.borderStrokeWidth(1.5/scale);transformer.rotateAnchorOffset(28/scale);select(selection);
 };
 return {sync,select,get active(){return active;},destroy(){destroyed=true;stage.destroy();nodes.clear();}};
}
