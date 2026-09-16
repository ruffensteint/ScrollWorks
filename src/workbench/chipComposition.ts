import {borderPhrases} from './chipBorders';
import type {Point} from './geometry';
import type {ChipSettings} from './chip';

/** Choose a composition once. Repeats share the same vocabulary and direction;
 * there are no independent random decisions for individual cells. */
export function composeChips(s:ChipSettings):Point[][]{
 const g=s.grid??5,n=Math.floor(s.size/g),c=Math.floor(n/2),r=Math.max(2,c-1),out:Point[][]=[];
 let state=(s.seed??1248)>>>0;
 const random=()=>{state+=0x6D2B79F5;let t=Math.imul(state^state>>>15,state|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
 const borderStyle=Math.floor(random()*3),pitch=2+Math.floor(random()*2),heart=Math.floor(random()*3);
 const add=(p:Point[])=>{if(p.every(q=>q.x>=0&&q.y>=0&&q.x<=n&&q.y<=n))out.push(p.map(q=>({x:q.x*g,y:q.y*g})));};
 const rotate=(p:Point,k:number)=>{let x=p.x,y=p.y;for(let j=0;j<k;j++){const a=x;x=-y;y=a;}return {x:c+x,y:c+y};};
 const four=(p:Point[])=>{for(let k=0;k<4;k++)add(p.map(q=>rotate(q,k)));};
 // Keep the center's random sequence independent of border variations.
 if(s.borderVersion===1){for(const phrase of borderPhrases(r,s.borderSeed??s.seed??1248))four(phrase);}
 else if(r>=4){const lo=-r+2,hi=r-2,depth=r>=7?2:1;
  for(let t=lo;t+pitch<=hi;t+=pitch){const mid=t+1;const p=borderStyle===0?[{x:t,y:-r},{x:t+pitch,y:-r},{x:mid,y:-r+depth}]:borderStyle===1?[{x:t,y:-r+depth},{x:mid,y:-r},{x:t+pitch,y:-r+depth}]:[{x:t,y:-r+1},{x:mid,y:-r},{x:t+pitch,y:-r+1},{x:mid,y:-r+depth}];if(borderStyle!==2||depth>1)four(p);else four([{x:t,y:-r},{x:t+pitch,y:-r},{x:mid,y:-r+1}]);}
  four([{x:-r,y:-r+1},{x:-r+1,y:-r},{x:-r+2,y:-r+1},{x:-r+1,y:-r+2}]);
 }
 if(s.family==='border'){if(!out.length)four([{x:-1,y:-r},{x:1,y:-r},{x:0,y:-r+1}]);return out;}
 const inner=Math.max(2,r-4),a=Math.max(1,Math.floor(inner*.47)),b=Math.max(1,Math.floor(inner*.16));
 // A single eight-point center with an open margin before the border.
 if(s.family==='rosette'){
  four([{x:0,y:0},{x:-b,y:-a},{x:0,y:-inner},{x:b,y:-a}]);
  if(inner>=4)four([{x:0,y:0},{x:a,y:-b},{x:a,y:-a},{x:b,y:-a}]);
 }else{
  const tip=heart===0?inner:Math.max(2,inner-1);
  four([{x:0,y:0},{x:-b,y:-a},{x:0,y:-tip}]);
  four([{x:0,y:0},{x:0,y:-tip},{x:b,y:-a}]);
  if(inner>=5){const d=Math.max(a+1,Math.floor(inner*(heart===2?.7:.8)));
   four([{x:-1,y:-1},{x:-a,y:-b},{x:-d,y:-d}]);
   four([{x:-1,y:-1},{x:-d,y:-d},{x:-b,y:-a}]);
  }
 }
 // A secondary ring repeats around the center, never scatters across the field.
 if(inner>=8&&s.family==='rosette'){const ring=inner-1;
  for(let t=-ring+2;t<=ring-2;t+=pitch+1){
   if(Math.abs(t)<a+1)continue;
   four([{x:t,y:-ring},{x:t+1,y:-ring+1},{x:t,y:-ring+2},{x:t-1,y:-ring+1}]);
  }
 }
 return out;
}
