import {it,expect} from 'vitest';
import {initialLayout,growthForBackbone,setBackboneGrowth,parseLayout} from './model';
import {generateGrowth,defaultGrowth} from './growth';

it('changes only the selected backbone and retains settings through saving',()=>{
 const d=initialLayout();d.extraCurves=[d.curve];d.growth={...defaultGrowth,composition:2};
 const before=generateGrowth(d,d.growth);
 const edited=setBackboneGrowth(d,1,{...d.growth,family:'border',levels:1,sweeps:2,secondaryScale:1.5,leaves:0,seed:99});
 const saved=parseLayout(JSON.stringify(edited)),after=generateGrowth(saved,saved.growth);
 expect(after.parts.filter(p=>p.id.startsWith('backbone-0/'))).toEqual(before.parts.filter(p=>p.id.startsWith('backbone-0/')));
 expect(after.parts.filter(p=>p.id.startsWith('backbone-1/'))).not.toEqual(before.parts.filter(p=>p.id.startsWith('backbone-1/')));
 expect(growthForBackbone(saved,1)).toEqual(edited.backboneGrowth![1]);
 expect(growthForBackbone(saved,0)).toEqual(d.growth);
});
it('uses backbone settings for single-backbone layouts and rejects malformed saved settings',()=>{
 const d=setBackboneGrowth(initialLayout(),0,{...defaultGrowth,family:'spray'});
 expect(generateGrowth(d)).toEqual(generateGrowth({...d,backboneGrowth:undefined},d.backboneGrowth![0]));
 expect(()=>parseLayout(JSON.stringify({...d,backboneGrowth:[{...defaultGrowth,levels:7}]}))).toThrow();
 expect(()=>parseLayout(JSON.stringify({...d,backboneGrowth:[]}))).toThrow();
});
