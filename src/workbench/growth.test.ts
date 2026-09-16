import {describe,it,expect} from 'vitest';
import {initialLayout,exportSvg,parseLayout} from './model';
import {defaultGrowth,generateGrowth,growthDrawing,growCurl,lineFrame} from './growth';
describe('growth construction',()=>{
 it('builds only the requested one or two dominant sweeps',()=>{for(const sweeps of [1,2] as const){const r=generateGrowth(initialLayout(),{...defaultGrowth,sweeps});const mains=r.parts.filter(p=>p.kind==='primary');expect(mains).toHaveLength(sweeps);for(const p of r.parts.filter(p=>p.kind==='secondary')){expect(mains.some(m=>m.id===p.parent)).toBe(true);const parent=mains.find(m=>m.id===p.parent)!;expect(p.length).toBeLessThan(parent.length*.6);}}});
 it('starts each curl along its parent tangent',()=>{for(const side of [-1,1]){const angle=.7,p=growCurl({x:0,y:0},angle,30,1,side),a=Math.atan2(p[1].y,p[1].x);expect(Math.abs(a-angle)).toBeLessThan(.04);}});
 it('keeps child roots on the parent centerline',()=>{const r=generateGrowth(initialLayout());for(const p of r.parts.filter(p=>p.parent)){const parent=r.parts.find(q=>q.id===p.parent)!;let closest=Infinity;for(let i=0;i<=2000;i++){const q=lineFrame(parent.points,i/2000).point;closest=Math.min(closest,Math.hypot(q.x-p.points[0].x,q.y-p.points[0].y));}expect(closest).toBeLessThan(.08);}});
 it('handles a collapsed backbone without exporting invalid coordinates',()=>{const d=initialLayout();d.curve=[{x:30,y:30},{x:30,y:30},{x:30,y:30},{x:30,y:30}];expect(generateGrowth(d).parts).toHaveLength(0);});
 it('produces a different structure for a new variation',()=>{const d=initialLayout();expect(generateGrowth(d,{...defaultGrowth,seed:1249}).parts).not.toEqual(generateGrowth(d).parts);});
 it('uses the spiral backbone even for older saved construction settings',()=>{const d=initialLayout();expect(generateGrowth(d,{...defaultGrowth,construction:'branching'})).toEqual(generateGrowth(d));expect(generateGrowth(d).parts[0].id).toBe('spiral');});
 it('exports full geometry and round trips settings',()=>{const d={...initialLayout(),mode:'growth' as const,growth:defaultGrowth};expect(parseLayout(JSON.stringify(d))).toEqual(d);const svg=exportSvg(d);expect(svg).not.toMatch(/NaN|Infinity|mask|fill="white"/);expect(svg).toContain('240mm');expect(growthDrawing(generateGrowth(d),0).folds).toBe('');});
});
