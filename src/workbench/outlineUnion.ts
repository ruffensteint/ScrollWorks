import type { Point } from './geometry';
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export const lerp=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const sub=(a:Point,b:Point)=>({x:a.x-b.x,y:a.y-b.y});
export function box(points:Point[]){return {l:Math.min(...points.map(p=>p.x)),r:Math.max(...points.map(p=>p.x)),t:Math.min(...points.map(p=>p.y)),b:Math.max(...points.map(p=>p.y))};}
function overlaps(a:ReturnType<typeof box>,b:ReturnType<typeof box>){return a.l<=b.r&&a.r>=b.l&&a.t<=b.b&&a.b>=b.t;}
export function inside(p:Point,poly:Point[]):boolean {
  let hit=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
  }
  return hit;
}
export function intersection(a:Point,b:Point,c:Point,d:Point):number|null {
  const r=sub(b,a),s=sub(d,c),den=cross(r,s);if(Math.abs(den)<1e-10)return null;
  const t=cross(sub(c,a),s)/den,u=cross(sub(c,a),r)/den;
  return t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8?Math.max(0,Math.min(1,t)):null;
}
export const pointText=(p:Point)=>`${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
export const polyPath=(p:Point[],closed=false)=>p.length?`M ${p.map(pointText).join(' L ')}${closed?' Z':''}`:'';
/** Union boundary as open contour runs. No raster masks, white fills, or hidden
 * crossing outlines. These are engraving lines, not closed CNC toolpaths. */
export function unionOutline(polygons:Point[][]):string {
  const boxes=polygons.map(box),runs:string[]=[];
  polygons.forEach((poly,index)=>{
    const other=polygons.map((p,i)=>({p,i})).filter(o=>o.i!==index&&overlaps(boxes[index],boxes[o.i]));
    let run:Point[]=[];
    const flush=()=>{if(run.length>1)runs.push(polyPath(run));run=[];};
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length];if(distance(a,b)<1e-7)continue;
      const candidates=other.filter(o=>overlaps(box([a,b]),boxes[o.i]));
      const cuts=[0,1];
      for(const o of candidates)for(let j=0;j<o.p.length;j++){const t=intersection(a,b,o.p[j],o.p[(j+1)%o.p.length]);if(t!==null&&t>1e-7&&t<1-1e-7)cuts.push(t);}
      cuts.sort((x,y)=>x-y);
      for(let k=1;k<cuts.length;k++){
        if(cuts[k]-cuts[k-1]<1e-7)continue;
        const begin=lerp(a,b,cuts[k-1]),end=lerp(a,b,cuts[k]),mid=lerp(begin,end,.5);
        const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
        // Both sides covered means this segment is internal, including shared
        // collinear edges. Sampling either side avoids boundary ambiguity.
        const eps=.0001,n={x:-dy/len*eps,y:dx/len*eps};
        const covered=(p:Point)=>polygons.some((shape,j)=>overlaps(box([p]),boxes[j])&&inside(p,shape));
        const internal=covered({x:mid.x+n.x,y:mid.y+n.y})&&covered({x:mid.x-n.x,y:mid.y-n.y});
        const duplicate=candidates.some(o=>o.i<index&&o.p.some((c,j)=>{
          const d=o.p[(j+1)%o.p.length],v=sub(d,c);return Math.abs(cross(sub(mid,c),v))<1e-7&&distance(c,mid)+distance(mid,d)<distance(c,d)+1e-7;
        }));
        if(internal||duplicate){flush();continue;}
        if(!run.length)run=[begin,end];else if(distance(run.at(-1)!,begin)<.001)run.push(end);else {flush();run=[begin,end];}
      }
    }
    flush();
  });
  return runs.join(' ');
}
