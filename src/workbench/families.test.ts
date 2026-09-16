import {it,expect} from 'vitest';
import {generateGrowth,defaultGrowth} from './growth';
import {initialLayout,parseLayout} from './model';
import {arcTable} from './geometry';
it('grows distinct repeatable families from the supplied backbone and saves their selection',()=>{
 const signatures=new Set<string>();
 for(const family of ['spiral','spray','border','fan','branching'] as const){
  const d=initialLayout();d.growth={...defaultGrowth,family,composition:2};
  const a=generateGrowth(d,d.growth);
  expect(a).toEqual(generateGrowth(d,d.growth));
  expect(a.parts.length,family).toBeGreaterThan(1);
  expect(parseLayout(JSON.stringify(d)).growth?.family).toBe(family);
  const guide=arcTable(d.curve).map(p=>p.point);
  for(const p of a.parts.filter(p=>p.parent!==null))expect(Math.min(...guide.map(q=>Math.hypot(q.x-p.points[0].x,q.y-p.points[0].y)))).toBeLessThan(1);
  signatures.add(JSON.stringify(a.parts));
 }
 expect(signatures.size).toBe(5);
});

