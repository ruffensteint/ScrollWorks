import type {Point} from './geometry';
// The procedural lens sampler stores 21 points per side. Preserve that sample
// topology after editing so control identities cannot jump during a drag.
export function chipHandles(points:Point[]){
 if(points.length===21||points.length===42)return [0,10,20].map((index,i)=>({index,point:points[index],label:['Start','Middle','End'][i]}));
 return points.map((point,index)=>({index,point,label:`Corner ${index+1}`}));
}
export function moveChipHandle(points:Point[],index:number,target:Point):Point[]{
 if(points.length!==21&&points.length!==42)return points.map((p,i)=>i===index?target:p);
 const delta={x:target.x-points[index].x,y:target.y-points[index].y};
 return points.map((p,i)=>{const t=(i<=20?i:41-i)/20;
  const weight=index===0?(1-t)*(1-2*t):index===20?t*(2*t-1):4*t*(1-t);
  return {x:p.x+delta.x*weight,y:p.y+delta.y*weight};
 });
}
