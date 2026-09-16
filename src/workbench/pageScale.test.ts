import {it,expect} from 'vitest';
import {initialLayout,resizeLayout} from './model';
import {generateGrowth} from './growth';
it('scales the whole scroll proportionally on a larger canvas',()=>{const small=resizeLayout(initialLayout(),200,200),large=resizeLayout(small,1000,1000),a=generateGrowth(small),b=generateGrowth(large);expect(b.parts.length).toBe(a.parts.length);a.parts.forEach((p,i)=>{expect(b.parts[i].width).toBeCloseTo(p.width*5);p.polygon.forEach((q,j)=>{expect(b.parts[i].polygon[j].x).toBeCloseTo(q.x*5);expect(b.parts[i].polygon[j].y).toBeCloseTo(q.y*5);});});});
