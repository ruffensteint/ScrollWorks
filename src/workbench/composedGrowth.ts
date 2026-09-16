import {arcTable,type Point} from './geometry';
import {lineFrame,lineLength,growCurl,type GrowthPart,type GrowthResult,type GrowthSettings} from './growth';
import type {Layout} from './model';
import {spiralAnatomy} from './spiralAnatomy';
import {acanthusContour,GOLDEN_SMALL as phi} from './acanthusContour';
import {distance,inside} from './outlineUnion';
export function composedGrowth(layout:Layout,s:GrowthSettings):GrowthResult{
 const family=s.family??"spiral";
 const main=spiralAnatomy(layout,{...s,levels:1,sweeps:1}).parts[0];

 const guide=arcTable(layout.curve).map(p=>p.point),length=lineLength(guide);
 // Open families follow the full guide without adding an enclosing terminal spiral.
 if(family==='spray'||family==='fan'||family==='border'){
  const anatomy=acanthusContour(guide,1.5,s.side==='right'?1:-1,length*(family==='fan'?.035:.012),0,0,false);
  Object.assign(main,{points:guide,length,polygon:anatomy.polygon,folds:[],contourSplit:241});
 }
 const parts:GrowthPart[]=[...(layout.lockedParts??[])];if(!parts.some(p=>p.id===main.id))parts.unshift(main);
 let seed=s.seed>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const reach=Math.min(36,length*(1-phi)*phi),roles=family==='border'?['roll-0','roll-1','roll-2','roll-3','roll-4']:family==='fan'?['fan-0','fan-1','fan-2']:family==='spray'?['spray-0','spray-1','spray-2']:family==='branching'?['companion','shoot-2','shoot-0','shoot-1']:s.sweeps===2?['companion','shoot-2','shoot-0','shoot-1']:s.levels===1?['shoot-2']:['shoot-2','shoot-0','shoot-1'];
 let attempts=0,skipped=0;
 for(let role=0;role<roles.length;role++){
  const id=roles[role];if(parts.some(p=>p.id===id))continue;
  const ratio=family==='border'?.48:family==='fan'?[.85,1,.618][role]:family==='spray'?[1,.75,.5][role]:id==='companion'?phi:id==='shoot-2'?phi*.85:id==='shoot-0'?phi**2:phi**3;
  const candidates:{points:Point[];score:number;side:number;size:number;root:Point;bend:number}[]=[];
  for(let station=0;station<12;station++){
   const center=family==='border'?.12+role*.16:family==='fan'?.38+role*.10:family==='spray'?.20+role*.24:null;
   const t=center===null?.16+station*.053+(random()-.5)*.025:center+(station-5.5)*.004+(random()-.5)*.01,f=lineFrame(guide,t),a=lineFrame(guide,Math.max(0,t-.04)),b=lineFrame(guide,Math.min(1,t+.04));
   const bend=Math.atan2(Math.sin(b.angle-a.angle),Math.cos(b.angle-a.angle));
   for(const side of s.side==='left'?[-1]:s.side==='right'?[1]:family==='border'?[role%2?1:-1]:family==='fan'?[-1]:[-1,1])for(const shrink of [1,.8,.6]){
    attempts++;const size=reach*ratio*(s.secondaryScale??1)*shrink*(.94+random()*.12),points=growCurl(f.point,f.angle,size,family==='spray'?.30:family==='fan'?.22:family==='border'?.60:.66,side);
    if(points.some(p=>p.x<3||p.y<3||p.x>layout.width-3||p.y>layout.height-3))continue;
    let gap=Infinity;for(const p of points.filter((_,i)=>i>(family==='spiral'?24:48)&&i%8===0))for(const other of parts)for(const q of other.points.filter((_,j)=>j%12===0))gap=Math.min(gap,distance(p,q));
    if(gap<Math.max(1.3,size*.12))continue;
    const rootSpace=Math.min(...parts.filter(p=>p.parent!==null).map(p=>distance(p.points[0],f.point)),length);
    const score=Math.min(gap,20)+Math.min(rootSpace,20)*.25+Math.abs(bend)*4+(side*bend<0?2:0)+shrink*4+random()*2;
    candidates.push({points,score,side,size,root:f.point,bend});
   }
  }
  let accepted=false;
  for(const c of candidates.sort((a,b)=>b.score-a.score).slice(0,12)){
   const anatomy=acanthusContour(c.points,1.5,c.side,lineLength(c.points)*(1-phi)*(family==='spray'||family==='fan'?1:phi)*(.95-Math.min(.2,Math.abs(c.bend)*.2)),0,0,s.leaves>0);
   const polygon=anatomy.polygon;if(polygon.some(p=>p.x<1||p.y<1||p.x>layout.width-1||p.y>layout.height-1))continue;
   const collar=Math.max(4,c.size*(family==='spiral'?.25:.65));let collision=false;
   for(const other of parts){for(let i=0;i<polygon.length;i+=5){const p=polygon[i];if(distance(p,c.root)>collar&&inside(p,other.polygon)){collision=true;break;}}
    if(collision)break;
    for(let i=0;i<other.polygon.length;i+=8){const p=other.polygon[i];if(distance(p,c.root)>collar&&inside(p,polygon)){collision=true;break;}}
   }
   if(collision)continue;
   parts.push({id,parent:main.id,kind:id==='companion'?'primary':'secondary',points:c.points,polygon,folds:anatomy.folds,contourSplit:241,width:3,length:lineLength(c.points),birth:.2+role*.1,duration:.25});accepted=true;break;
  }
  if(!accepted)skipped++;
 }
 return {parts,trials:[],attempts,skipped,message:`${family} · ${parts.length-1} supporting sweeps${skipped?` · ${skipped} omitted to preserve space`:''}`};
}




