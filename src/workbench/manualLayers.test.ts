import {it,expect} from 'vitest';
import {joinedManualDrawing,visibleLines} from './manualJoin';
import {initialLayout,parseLayout} from './model';
import {generateGrowth,growthDrawing} from './growth';
const square=[{x:2,y:-2},{x:8,y:-2},{x:8,y:2},{x:2,y:2}];
it('clips hidden lines exactly at the overlay boundary',()=>{expect(visibleLines([[{x:0,y:0},{x:10,y:0}]],[square])).toBe('M 0.000 0.000 L 2.000 0.000 M 8.000 0.000 L 10.000 0.000');});
it('opens only the joined root while keeping the rest of an upper edge',()=>{const collar=[{x:-1,y:-1},{x:4,y:-1},{x:4,y:1},{x:-1,y:1}];expect(visibleLines([[{x:0,y:0},{x:10,y:0}]],[],[{collar,stems:[square]}])).toContain('M 4.000 0.000');});
it('keeps generated secondaries in manual mode',()=>{const d=initialLayout();d.joinManual=true;d.items=[];const manual=joinedManualDrawing(d),grown=growthDrawing(generateGrowth(d));const coords=(s:string)=>s.match(/-?\d+\.\d+/g);expect(coords(manual.outline)).toEqual(coords(grown.outline));});
it('persists layer choices and changes overlap rendering',()=>{const d=initialLayout();d.joinManual=true;d.items=[{...d.items[0],progress:.6,length:90,onTop:false}];const below=joinedManualDrawing(d);d.items[0].onTop=true;expect(joinedManualDrawing(d).outline).not.toBe(below.outline);expect(parseLayout(JSON.stringify(d)).items[0].onTop).toBe(true);});
