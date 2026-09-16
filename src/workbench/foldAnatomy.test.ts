import {it,expect} from 'vitest';
import {acanthusContour} from './acanthusContour';
import {growCurl} from './growth';
import {inside,intersection} from './outlineUnion';
it('keeps lobe creases inside the unchanged silhouette without crossing each other',()=>{
 for(const side of [-1,1])for(const belly of [0,.618]){
  const spine=growCurl({x:80,y:80},-.4,30,.9,side);
  const leaf=acanthusContour(spine,2,side,16,0,belly);
  expect(leaf.folds).toHaveLength(2);
  for(const line of leaf.folds)for(const p of line)expect(inside(p,leaf.polygon)).toBe(true);
  const [a,b]=leaf.folds;
  for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++)expect(intersection(a[i-1],a[i],b[j-1],b[j])).toBeNull();
 }
});
