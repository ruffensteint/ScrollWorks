import {it,expect} from 'vitest';
import {acanthusContour,GOLDEN_SMALL} from './acanthusContour';
import {generateGrowth} from './growth';
import {initialLayout} from './model';
it('broadens the main inner contour without changing its outer sweep',()=>{const p=generateGrowth(initialLayout()).parts[0],a=acanthusContour(p.points,2,-1,20,.4),b=acanthusContour(p.points,2,-1,20,.4,GOLDEN_SMALL);expect(a.polygon.slice(0,241)).toEqual(b.polygon.slice(0,241));expect(a.polygon[241]).toEqual(b.polygon[241]);expect(a.polygon.slice(242)).not.toEqual(b.polygon.slice(242));});
