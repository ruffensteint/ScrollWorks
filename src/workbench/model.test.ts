import { describe,it,expect } from 'vitest';
import { at,frame,fitCurve,nearest,type Curve } from './geometry';
import { initialLayout,exportSvg,parseLayout,placedPaths,resizeLayout } from './model';
import { motifs } from './library';
describe('local motif layouts',()=>{
 it('places roots at arc-length positions on a straight but unevenly parameterized backbone',()=>{
   const c:Curve=[{x:0,y:20},{x:1,y:20},{x:2,y:20},{x:100,y:20}];
   expect(frame(c,.5).point.x).toBeCloseTo(50,1);
   expect(nearest(c,{x:50,y:25})).toBeCloseTo(.5,1);
 });
 it('keeps every motif root attached under rotation, mirror, and flex',()=>{
   const d=initialLayout();
   for(const m of motifs){const i={...d.items[0],motif:m.id,mirror:true,angle:93,bend:20};
     const p=placedPaths(d,i),f=frame(d.curve,i.progress);
     expect(p.outline.startsWith(`M ${f.point.x.toFixed(3)} ${f.point.y.toFixed(3)}`)).toBe(true);
     expect(p.outline).not.toMatch(/NaN|Infinity/);
   }
 });
 it('fits an evenly sampled drawn cubic and preserves its endpoints',()=>{
   const c:Curve=[{x:10,y:40},{x:40,y:5},{x:60,y:75},{x:95,y:30}];
   const points=Array.from({length:80},(_,i)=>at(c,i/79));const fit=fitCurve(points)!;
   expect(fit[0]).toEqual(c[0]);expect(fit[3]).toEqual(c[3]);
   expect(Math.hypot(at(fit,.5).x-at(c,.5).x,at(fit,.5).y-at(c,.5).y)).toBeLessThan(4);
   expect(fitCurve([{x:0,y:0},{x:0,y:0},{x:0,y:0}])).toBeNull();
 });
 it('round-trips edits and rejects malformed or oversized imports',()=>{
   const d=initialLayout();expect(parseLayout(JSON.stringify(d))).toEqual(d);
   expect(()=>parseLayout(JSON.stringify({...d,width:0}))).toThrow();
   expect(()=>parseLayout(JSON.stringify({...d,items:[{...d.items[0],motif:'unknown'}]}))).toThrow();
   expect(()=>parseLayout(JSON.stringify({...d,items:[d.items[0],d.items[0]]}))).toThrow();
   expect(()=>parseLayout(JSON.stringify({...d,items:[{...d.items[0],length:null}]}))).toThrow();
 });
 it('exports physical millimetres and only intended artwork',()=>{
   const d=initialLayout(),s=exportSvg(d);
   expect(s).toContain('width="240mm" height="150mm"');
   expect(s).not.toMatch(/circle|dasharray|image|http[^s:]|script|data:/);
   expect(s.match(/<path /g)?.length).toBe(6);
   expect(exportSvg({...d,printBackbone:true}).match(/<path /g)?.length).toBe(7);
 });
 it('resizes the placement frame without silently changing motif lengths',()=>{
   const d=initialLayout(),next=resizeLayout(d,480,300);
   expect(next.curve[0].x).toBe(d.curve[0].x*2);expect(next.items).toEqual(d.items);
 });
});
