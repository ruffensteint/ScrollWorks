export type Point = { x: number; y: number };
export type Curve = [Point, Point, Point, Point];
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function at(c: Curve, t: number): Point {
  const s = 1 - t;
  return { x: s*s*s*c[0].x + 3*s*s*t*c[1].x + 3*s*t*t*c[2].x + t*t*t*c[3].x,
    y: s*s*s*c[0].y + 3*s*s*t*c[1].y + 3*s*t*t*c[2].y + t*t*t*c[3].y };
}
export function tangent(c: Curve, t: number): Point {
  const s = 1-t;
  const x = 3*s*s*(c[1].x-c[0].x)+6*s*t*(c[2].x-c[1].x)+3*t*t*(c[3].x-c[2].x);
  const y = 3*s*s*(c[1].y-c[0].y)+6*s*t*(c[2].y-c[1].y)+3*t*t*(c[3].y-c[2].y);
  const d = Math.hypot(x,y);
  if (d > 1e-8) return { x:x/d, y:y/d };
  const a=at(c,Math.max(0,t-.001)), b=at(c,Math.min(1,t+.001));
  const h=Math.hypot(b.x-a.x,b.y-a.y);
  return h>1e-8 ? {x:(b.x-a.x)/h,y:(b.y-a.y)/h} : {x:1,y:0};
}
export function arcTable(c: Curve) {
  const rows = [{ t:0, length:0, point:c[0] }];
  for(let i=1;i<=240;i++) {
    const p=at(c,i/240), prev=rows[i-1];
    rows.push({t:i/240,point:p,length:prev.length+Math.hypot(p.x-prev.point.x,p.y-prev.point.y)});
  }
  return rows;
}
export function frame(c: Curve, progress: number) {
  const rows=arcTable(c), distance=clamp(progress,0,1)*rows[240].length;
  const i=Math.max(1,rows.findIndex(r=>r.length>=distance));
  const a=rows[i-1],b=rows[i], fraction=(distance-a.length)/(b.length-a.length||1);
  const t=a.t+(b.t-a.t)*fraction;
  return { point:at(c,t), tangent:tangent(c,t) };
}
export function nearest(c: Curve,p: Point) {
  const rows=arcTable(c);
  const closest=rows.reduce((a,b)=> Math.hypot(b.point.x-p.x,b.point.y-p.y)<Math.hypot(a.point.x-p.x,a.point.y-p.y)?b:a);
  return rows[240].length ? closest.length/rows[240].length : 0;
}
export const curvePath=(c: Curve)=>`M ${c[0].x} ${c[0].y} C ${c.slice(1).map(p=>`${p.x} ${p.y}`).join(' ')}`;

/** Least-squares cubic fit with fixed endpoints and chord-length parameters. */
export function fitCurve(points: Point[]): Curve | null {
  if(points.length<3) return null;
  const distances=[0];
  points.slice(1).forEach((p,i)=>distances.push(distances[i]+Math.hypot(p.x-points[i].x,p.y-points[i].y)));
  const length=distances.at(-1)!;
  if(length<5) return null;
  const start=points[0],end=points.at(-1)!;
  let aa=0,ab=0,bb=0,ax=0,ay=0,bx=0,by=0;
  points.forEach((p,i)=>{
    const t=distances[i]/length,s=1-t,a=3*s*s*t,b=3*s*t*t;
    const x=p.x-s*s*s*start.x-t*t*t*end.x,y=p.y-s*s*s*start.y-t*t*t*end.y;
    aa+=a*a;ab+=a*b;bb+=b*b;ax+=a*x;ay+=a*y;bx+=b*x;by+=b*y;
  });
  const det=aa*bb-ab*ab;
  if(Math.abs(det)<1e-8) return null;
  return [start,{x:(ax*bb-bx*ab)/det,y:(ay*bb-by*ab)/det},{x:(bx*aa-ax*ab)/det,y:(by*aa-ay*ab)/det},end];
}
