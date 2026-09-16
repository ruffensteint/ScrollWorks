import {at,type Point,type Curve} from './geometry';
import {lineFrame,lineLength} from './growth';
import {distance,inside} from './outlineUnion';
export const GOLDEN_SMALL=(Math.sqrt(5)-1)/2;
/** One enclosing contour: smooth outer sweep, returning inner lobes, common
 * root and tip. No independently warped leaf or extra outline at the curl. */
export function acanthusContour(spine:Point[],stemWidth:number,side:number,leafWidth:number,start=0,belly=0,lobed=true){
 const length=lineLength(spine);
 const frame=(t:number)=>{const f=lineFrame(spine,t),a=lineFrame(spine,Math.max(0,t-.002)).point,b=lineFrame(spine,Math.min(1,t+.002)).point;return {point:f.point,angle:Math.atan2(b.y-a.y,b.x-a.x)};};
 const map=(t:number,w:number)=>{const f=frame(t);return {x:f.point.x-Math.sin(f.angle)*w*side,y:f.point.y+Math.cos(f.angle)*w*side};};
 // Restrict width near the eye using a smooth local clearance field.
 const samples=Array.from({length:101},(_,j)=>frame(j/100).point);
 const limits=Array.from({length:161},(_,i)=>{const t=i/160,p=frame(t).point;let limit=leafWidth;for(let j=0;j<=100;j++){if(Math.abs(j/100-t)*length<leafWidth*2)continue;limit=Math.min(limit,distance(p,samples[j])*.40);}return limit;});
 for(let pass=0;pass<3;pass++){const copy=[...limits];for(let i=1;i<160;i++)limits[i]=(copy[i-1]+copy[i]*2+copy[i+1])/4;}
 const limit=(t:number)=>{const n=Math.min(159,Math.floor(t*160)),f=t*160-n;return limits[n]*(1-f)+limits[n+1]*f;};
 const outer=Array.from({length:241},(_,i)=>{const t=i/240;return map(t,-stemWidth*.5*Math.sin(Math.PI*t)**.7);});
 const profile:Curve[]=[
 [{x:1,y:0},{x:.97,y:.02},{x:.94,y:.06},{x:.91,y:.08}],
 [{x:.91,y:.08},{x:.88,y:.12},{x:.85,y:.24},{x:.82,y:.30}],
 [{x:.82,y:.30},{x:.77,y:.58},{x:.70,y:.54},{x:.73,y:.24}],
 [{x:.73,y:.24},{x:.65,y:.38},{x:.61,y:.86},{x:.54,y:.75}],
 [{x:.54,y:.75},{x:.49,y:.67},{x:.53,y:.46},{x:.54,y:.38}],
 [{x:.54,y:.38},{x:.46,y:.62},{x:.39,y:.84},{x:.32,y:.65}],
 [{x:.32,y:.65},{x:.22,y:.45},{x:.11,y:.10},{x:0,y:0}]
 ];
 // Add mass inward through the main sweep without moving its outer spine or
 // the tip. The secondary contour uses the unchanged zero-belly profile.
 const mass=(u:number)=>belly*Math.sin(Math.PI*u)**1.5;
 // The bare scroll retains a full, smooth belly. Leaves only articulate its edge.
 const innerProfile=lobed?profile.flatMap((c,j)=>Array.from({length:41},(_,i)=>at(c,i/40)).slice(j?1:0)):Array.from({length:281},(_,i)=>{const x=1-i/280;return {x,y:.65*Math.sin(Math.PI*x)**1.5};});
 const inner=innerProfile.map(p=>{const t=start+(1-start)*p.x;return map(t,stemWidth*.5*Math.sin(Math.PI*t)+(p.y+mass(p.x))*limit(t));});
 if(start>0)for(let i=1;i<=40;i++){const t=start*(1-i/40);inner.push(map(t,stemWidth*.5*Math.sin(Math.PI*t)));}
 const polygon=[...outer,...inner];
 // Each crease travels forward from the shared rib toward a specific lobe
 // return (.54/.38 and .73/.24 above). Stop inside the return, rather than
 // curling back to the rib and drawing a decorative closed-looking channel.
 const creaseProfiles:Curve[]=[
  [{x:.10,y:.025},{x:.25,y:.035},{x:.46,y:.19},{x:.538,y:.34}],
  [{x:.34,y:.035},{x:.49,y:.045},{x:.65,y:.10},{x:.727,y:.21}]
 ];
 const folds=lobed?creaseProfiles.flatMap(c=>{
  const line=Array.from({length:81},(_,i)=>{const u=i/80,p=at(c,u),t=start+(1-start)*p.x;
   return map(t,stemWidth*.5*Math.sin(Math.PI*t)+(p.y+mass(p.x)*(.18+.72*u))*limit(t));
  });
  // On unusually tight bends keep only the continuous interior crease;
  // never bridge across a notch or outside the leaf silhouette.
  const runs:Point[][]=[];let run:Point[]=[];
  for(const p of line){if(inside(p,polygon))run.push(p);else {if(run.length)runs.push(run);run=[];}}
  if(run.length)runs.push(run);
  const longest=runs.sort((a,b)=>b.length-a.length)[0];
  return longest&&longest.length>=24?[longest]:[];
 }):[];
 return {polygon,folds};
}
