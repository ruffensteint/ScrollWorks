import {it,expect} from 'vitest';
import {generateGrowth} from './growth';
import {initialLayout} from './model';
import {intersection} from './outlineUnion';
it('checks spiral silhouette crossings',()=>{const p=generateGrowth(initialLayout()).parts[0].polygon;const hits=[];for(let i=0;i<p.length;i++)for(let j=i+2;j<p.length;j++){if(i===0&&j===p.length-1)continue;const t=intersection(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]);if(t!==null&&t>1e-5&&t<1-1e-5)hits.push([i,j]);}expect(hits).toHaveLength(0);});
