import {it,expect} from 'vitest';
import {initialLayout,parseLayout,resizeLayout,replaceBackbone,placedPaths,exportSvg} from './model';
import {generateGrowth} from './growth';
import {joinedManualDrawing} from './manualJoin';
it('preserves separate backbones through saving, generation, editing and resizing',()=>{
 const d=initialLayout();d.extraCurves=[d.curve.map(p=>({...p,y:p.y-30})) as typeof d.curve];
 const saved=parseLayout(JSON.stringify(d));expect(saved.extraCurves).toEqual(d.extraCurves);
 const before=generateGrowth(saved),edited=replaceBackbone(saved,1,d.curve),after=generateGrowth(edited);
 expect(before.parts.filter(p=>p.id.startsWith('backbone-0/'))).toEqual(after.parts.filter(p=>p.id.startsWith('backbone-0/')));
 expect(new Set(before.parts.map(p=>p.id)).size).toBe(before.parts.length);
 expect(resizeLayout(saved,480,300).extraCurves?.[0][0].y).toBe(d.extraCurves[0][0].y*2);
 expect(()=>parseLayout(JSON.stringify({...d,extraCurves:[[{}]]}))).toThrow();
});
it('attaches manual pieces to their own backbone and exports the joined drawing',()=>{
 const d=initialLayout();d.extraCurves=[d.curve.map(p=>({...p,y:p.y-30})) as typeof d.curve];
 const item=d.items[0],a=placedPaths(d,item),b=placedPaths(d,{...item,backbone:1});expect(b.root.y).toBeCloseTo(a.root.y-30);
 d.joinManual=true;const drawing=joinedManualDrawing(d);expect(drawing.outline.length).toBeGreaterThan(100);expect(exportSvg(d)).toContain(drawing.outline);expect(parseLayout(JSON.stringify(d)).joinManual).toBe(true);
});
