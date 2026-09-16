import {traditionalChips} from './traditionalChips';
import type {Point} from './geometry';
import {polyPath,intersection} from './outlineUnion';
import {composeChips} from './chipComposition';
export type ChipFamily='rosette'|'star'|'border';
export interface ChipSettings {family:ChipFamily;count:number;size:number;removed:number[];seed?:number;grid?:number;edits?:Record<string,Point[]>;grammar?:2;borderSeed?:number;borderVersion?:1;traditional?:boolean}
export const defaultChip:ChipSettings={family:'star',count:6,size:100,removed:[],seed:1248,grid:5,grammar:2,borderVersion:1,traditional:true};
const polar=(r:number,a:number):Point=>({x:r*Math.cos(a),y:r*Math.sin(a)});
export function validChip(points:Point[]):boolean{
 points=points.filter((p,i)=>i===0||Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)>.000001);
 if(points.length>1&&Math.hypot(points[0].x-points.at(-1)!.x,points[0].y-points.at(-1)!.y)<.000001)points=points.slice(0,-1);
 if(points.length<3)return false;
 let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(a.x-b.x,a.y-b.y)<.001)return false;area+=a.x*b.y-b.x*a.y;
 for(let j=i+2;j<points.length;j++){if(i===0&&j===points.length-1)continue;if(intersection(a,b,points[j],points[(j+1)%points.length])!==null)return false;}}
 return Math.abs(area)>.01;
}
export function chipRegions(s:ChipSettings):Point[][]{
 if(s.grid!==undefined)return gridRegions(s).map((p,i)=>s.edits?.[i]??p);
 const R=s.size*.42,c=s.size/2;
 if(s.family==='border')return Array.from({length:s.count*2},(_,i)=>{const step=s.size/(s.count*2+1),x=step*(i+1),y=c;return [{x,y:y-step*.8},{x:x+step*.45,y},{x,y:y+step*.8},{x:x-step*.45,y}];});
 return Array.from({length:s.count},(_,i)=>{
  const a=i*Math.PI*2/s.count-Math.PI/2;
  if(s.family==='star')return [polar(R*.12,a-Math.PI/s.count),polar(R,a),polar(R*.12,a+Math.PI/s.count)].map(p=>({x:p.x+c,y:p.y+c}));
  // Two equal-radius circle arcs intersect at the common center and petal tip.
  // Their lens narrows automatically to fit the rotational sector.
  const half=Math.min(Math.PI/6,Math.PI/s.count*.85),radius=R/(2*Math.sin(half)),offset=radius*Math.cos(half);
  const p:Point[]=[];
  for(let j=0;j<=40;j++){const t=-half+2*half*j/40;p.push({x:R/2+radius*Math.sin(t),y:radius*Math.cos(t)-offset});}
  for(let j=40;j>=0;j--){const t=-half+2*half*j/40;p.push({x:R/2+radius*Math.sin(t),y:offset-radius*Math.cos(t)});}
  return p.map(p=>({x:c+p.x*Math.cos(a)-p.y*Math.sin(a),y:c+p.x*Math.sin(a)+p.y*Math.cos(a)}));
 });
}
export function gridRegions(s:ChipSettings):Point[][]{
 if(s.traditional)return traditionalChips(s);
 if(s.grammar===2)return composeChips(s);
 const step=s.grid??5,cells=Math.floor(s.size/step),tiles=Math.floor((cells-2)/4),regions:Point[][]=[];
 let seed=(s.seed??1248)>>>0;
 const random=()=>{seed+=0x6D2B79F5;let t=Math.imul(seed^seed>>>15,seed|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
 const vocabulary:Point[][][]=[
  [[{x:2,y:0},{x:3,y:2},{x:2,y:4},{x:1,y:2}]],
  [[{x:0,y:0},{x:4,y:0},{x:2,y:2}],[{x:0,y:4},{x:4,y:4},{x:2,y:2}]],
  [[{x:2,y:0},{x:4,y:2},{x:2,y:2}],[{x:2,y:4},{x:0,y:2},{x:2,y:2}]],
  [[{x:2,y:0},{x:3,y:1},{x:2,y:2},{x:1,y:1}],[{x:4,y:2},{x:3,y:3},{x:2,y:2},{x:3,y:1}],[{x:2,y:4},{x:1,y:3},{x:2,y:2},{x:3,y:3}],[{x:0,y:2},{x:1,y:1},{x:2,y:2},{x:1,y:3}]],
  [[{x:0,y:1},{x:2,y:1},{x:1,y:3}],[{x:2,y:1},{x:4,y:1},{x:3,y:3}]]
 ];
 const recipes=Array.from({length:Math.ceil(tiles/2)**2},()=>({motif:Math.floor(random()*vocabulary.length),turn:Math.floor(random()*4)}));
 const offset=Math.floor((cells-tiles*4)/2);
 for(let y=0;y<tiles;y++)for(let x=0;x<tiles;x++){
  if(s.family==='border'&&x>0&&y>0&&x<tiles-1&&y<tiles-1)continue;
  const mx=Math.min(x,tiles-1-x),my=Math.min(y,tiles-1-y),recipe=recipes[my*Math.ceil(tiles/2)+mx];
  const motif=s.family==='rosette'&&mx===my?3:recipe.motif;
  for(const poly of vocabulary[motif])regions.push(poly.map(p=>{
   let a=p.x-2,b=p.y-2;for(let k=0;k<recipe.turn;k++){const t=a;a=-b;b=t;}
   if(x>=tiles/2)a=-a;if(y>=tiles/2)b=-b;
   return {x:(offset+x*4+2+a)*step,y:(offset+y*4+2+b)*step};
  }));
 }
 return regions;
}
export function chipSvg(s:ChipSettings){return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.size}mm" height="${s.size}mm" viewBox="0 0 ${s.size} ${s.size}"><title>Chip carving ${s.family}</title><g fill="none" stroke="#000" stroke-width="0.25" stroke-linejoin="round">${chipRegions(s).filter((_,i)=>!s.removed.includes(i)).map(p=>`<path d="${polyPath(p,true)}"/>`).join('')}</g></svg>`;}
export function parseChip(text:string):ChipSettings{
 const s=JSON.parse(text),finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
 if(!s||!['rosette','star','border'].includes(s.family)||!Number.isInteger(s.count)||s.count<4||s.count>16||!finite(s.size)||s.size<40||s.size>300||!Array.isArray(s.removed)||s.removed.length>10000||!s.removed.every((n:unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<10000))throw new Error('Unsupported chip pattern');
 if(s.borderSeed!==undefined&&(!Number.isInteger(s.borderSeed)||s.borderSeed<0||s.borderSeed>4294967295))throw new Error('Invalid border seed');
 if(s.seed!==undefined&&(!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295))throw new Error('Invalid chip seed');
 if(s.traditional!==undefined&&typeof s.traditional!=='boolean')throw new Error('Invalid construction mode');
 if(s.borderVersion!==undefined&&s.borderVersion!==1)throw new Error('Unsupported border version');
 if(s.grammar!==undefined&&s.grammar!==2)throw new Error('Unsupported chip composition');
 if(s.grid!==undefined&&(!finite(s.grid)||s.grid<2||s.grid>Math.min(30,s.size/6)))throw new Error('Invalid grid interval');
 if(s.edits!==undefined){if(!s.edits||typeof s.edits!=='object'||Array.isArray(s.edits)||Object.keys(s.edits).length>10000)throw new Error('Invalid chip edits');for(const [key,value] of Object.entries(s.edits)){if(!/^\d+$/.test(key)||Number(key)>=10000||!Array.isArray(value)||value.length<3||value.length>200||!value.every(p=>p&&finite(p.x)&&finite(p.y)&&p.x>=0&&p.y>=0&&p.x<=s.size&&p.y<=s.size))throw new Error('Invalid chip corner');}}
 return s;
}
