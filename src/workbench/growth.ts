import { arcTable, at, clamp, type Curve, type Point } from './geometry';
import type { Layout } from './model';
import { distance, lerp, polyPath, unionOutline } from './outlineUnion';
import {composedGrowth} from './composedGrowth';
import {spiralAnatomy} from './spiralAnatomy';

export interface GrowthSettings { seed:number; branches:number; reach:number; curl:number; levels:number; leaves:number; clearance:number; stem:number; side:'alternate'|'left'|'right'; family?:'spiral'|'spray'|'border'|'fan'|'branching'; composition?:1|2; secondaryScale?:number; sweeps?:1|2; construction?:'spiral'|'branching' }
export const defaultGrowth:GrowthSettings={seed:1248,branches:5,reach:33,curl:1,levels:2,leaves:2,clearance:2,stem:2.8,side:'alternate'};
export interface GrowthPart { id:string; parent:string|null; kind:'backbone'|'primary'|'secondary'|'leaf'; points:Point[]; polygon:Point[]; folds:Point[][]; length:number; width:number; birth:number; duration:number; contourSplit?:number }
export interface Trial {points:Point[];reason:'edge'|'spacing';parent:string}
export interface GrowthResult {parts:GrowthPart[];trials:Trial[];skipped:number;message:string;attempts:number}
function random(seed:number){let s=seed>>>0;return ()=>{s+=0x6D2B79F5;let t=Math.imul(s^s>>>15,s|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function lineLength(p:Point[]){return p.slice(1).reduce((sum,q,i)=>sum+distance(q,p[i]),0);}
export function lineFrame(points:Point[],progress:number){
  const target=clamp(progress,0,1)*lineLength(points);let total=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=distance(a,b);if(total+d>=target||i===points.length-1){const t=clamp((target-total)/(d||1),0,1);return {point:lerp(a,b,t),angle:Math.atan2(b.y-a.y,b.x-a.x)};}total+=d;}
  return {point:points[0],angle:0};
}
export function ribbon(points:Point[],width:number):Point[]{
  const left:Point[]=[],right:Point[]=[];
  points.forEach((p,i)=>{
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],angle=Math.atan2(b.y-a.y,b.x-a.x);
    const half=width*(.06+.94*(1-i/(points.length-1))**.75)/2;
    left.push({x:p.x-Math.sin(angle)*half,y:p.y+Math.cos(angle)*half});right.push({x:p.x+Math.sin(angle)*half,y:p.y-Math.cos(angle)*half});
  });return [...left,...right.reverse()];
}
/** A growth tip advances along a tangent with increasing turning rate and
 * decaying step size. Its root tangent agrees with its parent. */
export function growCurl(root:Point,angle:number,reach:number,curl:number,side:number):Point[]{
  const points=[root],steps=140,decay=.24;
  // A logarithmic spiral has a shrinking radius and a known root tangent.
  // Align that tangent with the parent instead of integrating a loose hook.
  const rotation=angle-Math.atan2(side,-decay);
  for(let i=1;i<=steps;i++){
    const theta=i/steps*Math.PI*2*1.25*curl,r=reach*Math.exp(-decay*theta);
    const x=r*Math.cos(theta)-reach,y=side*r*Math.sin(theta);
    points.push({x:root.x+x*Math.cos(rotation)-y*Math.sin(rotation),y:root.y+x*Math.sin(rotation)+y*Math.cos(rotation)});
  }
  return points;
}
export function growSweep(root:Point,angle:number,reach:number,curl:number,side:number):Point[]{
  const map=(x:number,y:number)=>({x:root.x+x*Math.cos(angle)-y*Math.sin(angle),y:root.y+x*Math.sin(angle)+y*Math.cos(angle)});
  const end=map(reach*1.35,side*reach*.6),heading=angle+side*.8;
  const curve:Curve=[root,map(reach*.65,0),{x:end.x-Math.cos(heading)*reach*.4,y:end.y-Math.sin(heading)*reach*.4},end];
  return [...Array.from({length:81},(_,i)=>at(curve,i/80)),...growCurl(end,heading,reach*.55,curl,side).slice(1)];
}
export function generateGrowth(layout:Layout,settings:GrowthSettings=defaultGrowth):GrowthResult {
  if(layout.extraCurves?.length){
    const results=[layout.curve,...layout.extraCurves].map((curve,index)=>{const r=generateGrowth({...layout,curve,extraCurves:undefined,backboneGrowth:undefined,lockedParts:layout.lockedParts?.filter(p=>p.id.startsWith(`backbone-${index}/`)).map(p=>({...p,id:p.id.split('/').at(-1)!,parent:p.parent?p.parent.split('/').at(-1)!:null}))},layout.backboneGrowth?.[index]??settings);const id=(s:string)=>`backbone-${index}/${s}`;return {...r,parts:r.parts.map(p=>({...p,id:id(p.id),parent:p.parent?id(p.parent):null})),trials:r.trials.map(t=>({...t,parent:id(t.parent)}))};});
    return {parts:results.flatMap(r=>r.parts),trials:results.flatMap(r=>r.trials),attempts:0,skipped:0,message:`${results.length} backbones · independently grown scrolls`};
  }
  settings=layout.backboneGrowth?.[0]??settings;
  if(lineLength(arcTable(layout.curve).map(r=>r.point))<10)return {parts:[],trials:[],attempts:0,skipped:0,message:'Draw a longer guide to grow a scroll.'};
  // Construct at a consistent design scale so millimeter page dimensions do
  // not leave curls and leaf widths capped at their small-page sizes.
  const scale=Math.sqrt(layout.width*layout.height/(240*150));
  const shrink=(p:Point)=>({x:p.x/scale,y:p.y/scale});
  const normalized={...layout,lockedParts:layout.lockedParts?.map(p=>({...p,points:p.points.map(shrink),polygon:p.polygon.map(shrink),folds:p.folds.map(f=>f.map(shrink)),width:p.width/scale,length:p.length/scale})),width:layout.width/scale,height:layout.height/scale,curve:layout.curve.map(p=>({x:p.x/scale,y:p.y/scale})) as Curve};
  const result=(settings.composition===2||(settings.family&&settings.family!=='spiral'))?composedGrowth(normalized,settings):spiralAnatomy(normalized,settings);
  const resize=(p:Point)=>({x:p.x*scale,y:p.y*scale});
  return {...result,parts:result.parts.map(p=>layout.lockedParts?.find(q=>q.id===p.id)??({...p,points:p.points.map(resize),polygon:p.polygon.map(resize),folds:p.folds.map(f=>f.map(resize)),width:p.width*scale,length:p.length*scale})),trials:result.trials.map(t=>({...t,points:t.points.map(resize)}))};
}
export function growthDrawing(result:GrowthResult,progress=1){
  const visible=result.parts.filter(p=>progress>=p.birth+p.duration);
  const active=result.parts.filter(p=>progress>=p.birth&&progress<p.birth+p.duration);
  const polygons=visible.map(p=>p.polygon),folds=visible.flatMap(p=>p.folds);
  for(const p of active){const t=clamp((progress-p.birth)/p.duration,0,1);if(p.kind==='leaf'){
    if(t>.1){const root=p.points[0];polygons.push(p.polygon.map(q=>lerp(root,q,t)));}
  }else{const count=Math.max(2,Math.ceil(p.points.length*t));polygons.push(p.contourSplit?[...p.polygon.slice(0,Math.max(2,Math.ceil(p.contourSplit*t))),...p.polygon.slice(p.polygon.length-Math.max(2,Math.ceil((p.polygon.length-p.contourSplit)*t)))]:p.polygon.length===p.points.length*2?[...p.polygon.slice(0,count),...p.polygon.slice(p.polygon.length-count)]:ribbon(p.points.slice(0,count),p.width));}}
  return {outline:polygons.length?unionOutline(polygons):'',folds:folds.map(p=>polyPath(p)).join(' ')};
}
export function growthSvg(layout:Layout,settings:GrowthSettings){
  const drawing=growthDrawing(generateGrowth(layout,settings));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}"><title>Procedural scroll — seed ${settings.seed}</title><g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round"><path d="${drawing.outline}" stroke-width="0.35"/><path d="${drawing.folds}" stroke-width="0.2"/></g></svg>`;
}


