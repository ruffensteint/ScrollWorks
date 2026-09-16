import { clamp, frame, curvePath, type Curve, type Point } from './geometry';
import { mapPath, motifs, controlPoints } from './library';
import { growthSvg, defaultGrowth, type GrowthSettings, type GrowthPart } from './growth';
import {joinedManualDrawing} from './manualJoin';

export interface Placement { id:string; motif:string; progress:number; length:number; fullness:number; angle:number; bend:number; mirror:boolean; folds:boolean; backbone?:number; onTop?:boolean }
export interface Layout { version:1; width:number; height:number; curve:Curve; extraCurves?:Curve[]; backboneGrowth?:GrowthSettings[]; lockedParts?:GrowthPart[]; joinManual?:boolean; items:Placement[]; printBackbone:boolean; mode?:'manual'|'growth'; growth?:GrowthSettings }
export const growthForBackbone=(d:Layout,index:number):GrowthSettings=>d.backboneGrowth?.[index]??d.growth??defaultGrowth;
export function setBackboneGrowth(d:Layout,index:number,g:GrowthSettings):Layout {
 const settings=backboneCurves(d).map((_,i)=>growthForBackbone(d,i));
 const changedFamily=(settings[index].family??'spiral')!==(g.family??'spiral');
 settings[index]=g;
 return {...d,backboneGrowth:settings,lockedParts:changedFamily?d.lockedParts?.filter(p=>d.extraCurves?.length?!p.id.startsWith('backbone-'+index+'/'):false):d.lockedParts};
}
export const backboneCurves=(d:Layout):Curve[]=>[d.curve,...d.extraCurves??[]];
export function replaceBackbone(d:Layout,index:number,curve:Curve):Layout {return index===0?{...d,curve,lockedParts:undefined}:{...d,lockedParts:undefined,extraCurves:(d.extraCurves??[]).map((c,i)=>i===index-1?curve:c)};}
export const storageKey='carve-motif-workbench-v1';
export function newPlacement(motif:string,progress=.35):Placement {
  return {id:crypto.randomUUID(),motif,progress,length:65,fullness:1,angle:0,bend:0,mirror:false,folds:true};
}
export function initialLayout():Layout {
  return {version:1,width:240,height:150,curve:[{x:34,y:112},{x:85,y:125},{x:110,y:66},{x:196,y:86}],
    items:[{...newPlacement('returning-leaf',.12),length:72,angle:-12},{...newPlacement('rolled-fan',.53),length:57,angle:-4},{...newPlacement('leaf-volute',.92),length:49,angle:-40}],printBackbone:false};
}
export function placedPaths(layout:Layout,item:Placement) {
  const motif=motifs.find(m=>m.id===item.motif)!;
  const f=frame(backboneCurves(layout)[item.backbone??0]??layout.curve,item.progress), a=Math.atan2(f.tangent.y,f.tangent.x)+item.angle*Math.PI/180;
  const map=(p:Point)=>{
    const x=(motif.root.y-p.y)/motif.height;
    const y=(p.x-motif.root.x)/motif.height*item.fullness*(item.mirror?-1:1);
    // Gentle quadratic flex leaves the root fixed and never stretches the
    // authored silhouette into the backbone's arbitrary curvature.
    const bent=y+item.bend/100*x*x;
    return {x:f.point.x+item.length*(x*Math.cos(a)-bent*Math.sin(a)),y:f.point.y+item.length*(x*Math.sin(a)+bent*Math.cos(a))};
  };
  return {outline:mapPath(motif.outline,map),folds:item.folds?mapPath(motif.folds,map):'',root:f.point};
}
export function exportSvg(layout:Layout) {
  if(layout.mode==='growth')return growthSvg(layout,layout.growth??defaultGrowth);
  if(layout.joinManual||layout.items.some(i=>i.onTop!==undefined)){const p=joinedManualDrawing(layout);return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}"><g fill="none" stroke="#000" stroke-linejoin="round" stroke-linecap="round"><path d="${p.outline}" stroke-width=".35"/><path d="${p.folds}" stroke-width=".2"/></g></svg>`;}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}"><title>Carve Design motif layout</title><g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">${layout.printBackbone?`<path d="${curvePath(layout.curve)}" stroke-width="0.35"/>`:''}${layout.items.map(i=>{const p=placedPaths(layout,i);return `<g><path d="${p.outline}" stroke-width="0.35"/>${p.folds?`<path d="${p.folds}" stroke-width="0.2"/>`:''}</g>`;}).join('')}</g></svg>`;
}
export function bounds(layout:Layout,item:Placement) {
  // A conservative control hull flags possible clipping, including extrema
  // between the endpoints, rather than claiming exact geometry validation.
  const p=placedPaths(layout,item), points=controlPoints(p.outline+' '+p.folds);
  return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
}
export function layoutWarnings(layout:Layout):string[] {
  const warnings:string[]=[];
  layout.items.forEach((i,index)=>{const b=bounds(layout,i);if(b.left<1||b.top<1||b.right>layout.width-1||b.bottom>layout.height-1)warnings.push(`Motif ${index+1} may reach the page edge.`);});
  return warnings;
}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const inRange=(x:unknown,a:number,b:number):x is number=>finite(x)&&x>=a&&x<=b;
export function parseLayout(text:string):Layout {
  const d=JSON.parse(text);
  if(!d||d.version!==1||!inRange(d.width,40,1000)||!inRange(d.height,40,1000)||!Array.isArray(d.curve)||d.curve.length!==4||!d.curve.every((p:Point)=>p&&inRange(p.x,-2000,2000)&&inRange(p.y,-2000,2000))||!Array.isArray(d.items)||d.items.length>100||typeof d.printBackbone!=='boolean')throw new Error('This is not a supported motif layout.');
  const ids=new Set<string>();
  if(d.lockedParts!==undefined){const point=(p:Point)=>p&&inRange(p.x,-2000,2000)&&inRange(p.y,-2000,2000);if(!Array.isArray(d.lockedParts)||d.lockedParts.length>100||!d.lockedParts.every((p:GrowthPart)=>p&&typeof p.id==='string'&&(p.parent===null||typeof p.parent==='string')&&['primary','secondary'].includes(p.kind)&&Array.isArray(p.points)&&p.points.length>=2&&p.points.length<=1000&&p.points.every(point)&&Array.isArray(p.polygon)&&p.polygon.length>=3&&p.polygon.length<=2000&&p.polygon.every(point)&&Array.isArray(p.folds)&&p.folds.length<=10&&p.folds.every(f=>Array.isArray(f)&&f.length<=1000&&f.every(point))&&inRange(p.width,0,1000)&&inRange(p.length,0,10000)&&inRange(p.birth,0,1)&&inRange(p.duration,0,1)&&(p.contourSplit===undefined||p.contourSplit===241)))throw new Error('Unsupported locked parts.');}

  if(d.joinManual!==undefined&&typeof d.joinManual!=='boolean')throw new Error('Unsupported manual joining setting.');
  if(d.backboneGrowth!==undefined){
   if(!Array.isArray(d.backboneGrowth)||d.backboneGrowth.length!==1+(d.extraCurves?.length??0))throw new Error('Unsupported backbone settings.');
   for(const g of d.backboneGrowth){if(!g)throw new Error('Unsupported backbone settings.');parseLayout(JSON.stringify({...d,backboneGrowth:undefined,growth:g}));}
  }
  if(d.extraCurves!==undefined&&(!Array.isArray(d.extraCurves)||d.extraCurves.length>19||!d.extraCurves.every((c:Curve)=>Array.isArray(c)&&c.length===4&&c.every(p=>p&&inRange(p.x,-2000,2000)&&inRange(p.y,-2000,2000)))))throw new Error('Unsupported backbones.');
  if(d.mode!==undefined&&!['manual','growth'].includes(d.mode))throw new Error('Unsupported design mode.');
  if(d.growth!==undefined){const g=d.growth;if(!g||(g.family!==undefined&&!['spiral','spray','border','fan','branching'].includes(g.family))||(g.composition!==undefined&&![1,2].includes(g.composition))||(g.secondaryScale!==undefined&&!inRange(g.secondaryScale,.5,2))||(g.construction!==undefined&&!['spiral','branching'].includes(g.construction))||(g.sweeps!==undefined&&![1,2].includes(g.sweeps))||!Number.isInteger(g.seed)||!inRange(g.seed,0,4294967295)||!Number.isInteger(g.branches)||!inRange(g.branches,1,8)||!inRange(g.reach,8,80)||!inRange(g.curl,.6,1.4)||![1,2].includes(g.levels)||![0,1,2].includes(g.leaves)||!inRange(g.clearance,0,8)||!inRange(g.stem,.5,6)||!['alternate','left','right'].includes(g.side))throw new Error('Unsupported growth settings.');}
  for(const i of d.items) {
    if(i.onTop!==undefined&&typeof i.onTop!=="boolean")throw new Error("Unsupported leaf layer.");
    if(i.backbone!==undefined&&(!Number.isInteger(i.backbone)||i.backbone<0||i.backbone>=(1+(d.extraCurves?.length??0))))throw new Error('Unsupported motif backbone.');
    if(!i||typeof i.id!=='string'||ids.has(i.id)||!motifs.some(m=>m.id===i.motif)||!inRange(i.progress,0,1)||!inRange(i.length,10,300)||!inRange(i.fullness,.65,1.4)||!inRange(i.angle,-180,180)||!inRange(i.bend,-20,20)||typeof i.mirror!=='boolean'||typeof i.folds!=='boolean')throw new Error('A motif has unsupported settings.');
    ids.add(i.id);
  }
  return d as Layout;
}
export function resizeLayout(d:Layout,width:number,height:number):Layout {
  width=clamp(width,40,1000);height=clamp(height,40,1000);
  const scale=(c:Curve)=>c.map(p=>({x:p.x*width/d.width,y:p.y*height/d.height})) as Curve;
  return {...d,width,height,lockedParts:undefined,curve:scale(d.curve),extraCurves:d.extraCurves?.map(scale)};
}
