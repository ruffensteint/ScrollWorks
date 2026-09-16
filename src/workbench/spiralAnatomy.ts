import {arcTable,type Point} from './geometry';
import type {Layout} from './model';
import type {GrowthSettings,GrowthPart,GrowthResult} from './growth';
import {lineLength,lineFrame,growCurl} from './growth';
import {distance} from './outlineUnion';
import {acanthusContour,GOLDEN_SMALL} from './acanthusContour';


/** Study 03 construction: the long tail continues directly into the enclosing
 * spiral. The inner edge carries lobes; accent shoots share the lower sweep. */
export function spiralAnatomy(layout:Layout,s:GrowthSettings):GrowthResult{
 let seed=s.seed>>>0;const rand=()=>{seed+=0x6D2B79F5;let t=Math.imul(seed^seed>>>15,seed|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
 const guide=arcTable(layout.curve).map(r=>r.point),guideLength=lineLength(guide),parts:GrowthPart[]=[];
 const inPage=(points:Point[])=>points.every(p=>p.x>=2&&p.y>=2&&p.x<=layout.width-2&&p.y<=layout.height-2);
 const terminal=lineFrame(guide,1),preferred=s.side==='right'?1:-1;
 let ending:Point[]=[],terminalSide=preferred,mainReach=Math.min(guideLength*(1-GOLDEN_SMALL)*GOLDEN_SMALL,36);
 for(const side of [preferred,-preferred]){if(ending.length)break;for(let scale=1;scale>=.15;scale-=.1){const p=growCurl(terminal.point,terminal.angle,mainReach*scale,.95,side);if(inPage(p)){ending=p;terminalSide=side;mainReach*=scale;break;}}}
 const spine=[...guide,...ending.slice(1)];
 function band(points:Point[],width:number,kind:GrowthPart['kind'],id:string,parent:string|null,birth:number,lobed=false):GrowthPart{
  const left:Point[]=[],right:Point[]=[],fold:Point[]=[];const length=lineLength(points);
  for(let i=0;i<points.length;i++){
   const t=i/(points.length-1),p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle),ny=Math.cos(angle);
   const taper=Math.sin(Math.PI*t)**.7*Math.min(1,((1-t)/.23)**2);
   // Two broad inner lobes per sweep, with smooth valleys, share one contour.
   const bump=(center:number,span:number)=>Math.exp(-(((t-center)/span)**2));
   const lobe=lobed?(kind==='primary'?.65+1.8*bump(.36,.045)+1.6*bump(.49,.047)+1.4*bump(.64,.05):.5+1.2*bump(.28,.1)+.9*bump(.49,.09)):.3;
   const tip=Math.min(1,((1-t)/.15)**2);
   const prev=points[Math.max(0,i-2)],next=points[Math.min(points.length-1,i+2)];
   let turn=Math.atan2(next.y-p.y,next.x-p.x)-Math.atan2(p.y-prev.y,p.x-prev.x);
   while(turn>Math.PI)turn-=2*Math.PI;while(turn< -Math.PI)turn+=2*Math.PI;
   const radius=distance(prev,next)/(2*Math.max(.001,Math.abs(turn)));
   let clearance=Infinity;
   for(let j=0;j<points.length;j++)if(Math.abs(j-i)>35)clearance=Math.min(clearance,distance(p,points[j])*.42);
   const cap=Math.max(.02,Math.min(radius*.55,clearance));
   const outer=Math.min(cap,width*(.035+.20*taper)*tip),inner=Math.min(cap,width*(.035+taper*lobe)*tip);
   left.push({x:p.x+nx*outer,y:p.y+ny*outer});right.push({x:p.x-nx*inner,y:p.y-ny*inner});
   if(t>.08&&t<.74)fold.push({x:p.x-nx*Math.min(inner*.4,width*taper*.22),y:p.y-ny*Math.min(inner*.4,width*taper*.22)});
  }
  const p:GrowthPart={id,parent,kind,points,polygon:[...left,...right.reverse()],folds:lobed?[fold]:[],width,length,birth,duration:kind==='primary'?.52:.25};parts.push(p);return p;
 }
 const main=band(spine,Math.min(7.3,guideLength*.045),'primary','spiral',null,0);
 // All shoots emerge along the rising tail, leaving the spiral eye open.
 const count=s.levels===2?3:1,secondaryScale=s.secondaryScale??1;
 for(let i=0;i<count;i++){
  const progress=[(1-GOLDEN_SMALL)*GOLDEN_SMALL,1-GOLDEN_SMALL,GOLDEN_SMALL][i],f=lineFrame(guide,progress),side=i===1?-1:1;
  const reach=mainReach*[GOLDEN_SMALL**2,GOLDEN_SMALL**3,GOLDEN_SMALL][i]*(.97+rand()*.06)*secondaryScale;
  let shoot=growCurl(f.point,f.angle,reach,.66,side);for(let k=0;k<8&&!inPage(shoot);k++)shoot=growCurl(f.point,f.angle,reach*(.8-k*.08),.66,-side);if(!inPage(shoot))continue;
  band(shoot,(i===2?5.6:4.5)*secondaryScale,'secondary',`shoot-${i}`,main.id,.20+i*.11);
 }
 if(s.sweeps===2){const f=lineFrame(guide,.35),p=growCurl(f.point,f.angle,Math.min(16,guideLength*.1)*secondaryScale,.85,-1);if(inPage(p))band(p,4.5,'primary','companion',main.id,.18);}
 {
  for(const p of parts){const f0=lineFrame(p.points,.15),f1=lineFrame(p.points,.55);let turn=f1.angle-f0.angle;while(turn>Math.PI)turn-=2*Math.PI;while(turn< -Math.PI)turn+=2*Math.PI;
   const side=p===main?terminalSide:Math.sign(turn)||terminalSide;
   const leafWidth=p===main?mainReach*GOLDEN_SMALL:p.length*(1-GOLDEN_SMALL)*GOLDEN_SMALL;
   const anatomy=acanthusContour(p.points,Math.min(2,p.width*.45),side,leafWidth,p===main?guideLength/p.length*GOLDEN_SMALL:0,p===main?GOLDEN_SMALL:0,s.leaves>0);
   p.polygon=anatomy.polygon;p.folds=anatomy.folds;p.contourSplit=241;
  }
 }
 return {parts,trials:[],attempts:0,skipped:0,message:`Curve-grown backbone · ${parts.filter(p=>p.kind==='secondary').length} accent shoots`};
}


