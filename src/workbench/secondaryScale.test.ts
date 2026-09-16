import {it,expect} from 'vitest';
import {initialLayout,parseLayout} from './model';
import {generateGrowth,defaultGrowth} from './growth';
it('enlarges secondary sweeps without moving roots or changing the main contour',()=>{const d=initialLayout(),a=generateGrowth(d),b=generateGrowth(d,{...defaultGrowth,secondaryScale:1.25});expect(b.parts[0]).toEqual(a.parts[0]);const small=a.parts.find(p=>p.kind==='secondary')!,large=b.parts.find(p=>p.id===small.id)!;expect(large.points[0]).toEqual(small.points[0]);expect(large.length).toBeCloseTo(small.length*1.25);expect(()=>parseLayout(JSON.stringify({...d,growth:{...defaultGrowth,secondaryScale:20}}))).toThrow();});
