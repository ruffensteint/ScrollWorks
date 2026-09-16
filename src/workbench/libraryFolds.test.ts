import {it,expect} from 'vitest';
import {motifs,flattenPath} from './library';
import {inside,intersection} from './outlineUnion';
it('keeps revised library creases inside their silhouettes and apart',()=>{
 for(const m of motifs.filter(m=>m.id!=='returning-leaf')){
  const polygon=flattenPath(m.outline,80)[0],folds=flattenPath(m.folds,80);
  for(const line of folds)for(const p of line)expect(inside(p,polygon),`${m.name}: ${p.x},${p.y}`).toBe(true);
  for(let a=0;a<folds.length;a++)for(let b=a+1;b<folds.length;b++)for(let i=1;i<folds[a].length;i++)for(let j=1;j<folds[b].length;j++)expect(intersection(folds[a][i-1],folds[a][i],folds[b][j-1],folds[b][j]),m.name).toBeNull();
 }
});
