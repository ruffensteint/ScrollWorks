import {it,expect} from 'vitest';
import {arcTable} from './geometry';
import {initialLayout} from './model';
import {generateGrowth} from './growth';
it('follows the entire supplied curve without translating or fitting it',()=>{const d=initialLayout(),p=generateGrowth(d).parts[0].points;expect(p.slice(0,241)).toEqual(arcTable(d.curve).map(p=>p.point));const changed={...d,curve:[d.curve[0],{x:60,y:25},{x:155,y:135},d.curve[3]] as typeof d.curve};const q=generateGrowth(changed).parts[0].points;expect(q.slice(0,241)).toEqual(arcTable(changed.curve).map(p=>p.point));expect(q[120]).not.toEqual(p[120]);expect(q[0]).toEqual(p[0]);expect(q[240]).toEqual(p[240]);});
