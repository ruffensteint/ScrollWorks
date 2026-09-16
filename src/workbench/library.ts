import type { Point } from './geometry';
import {referenceMotifs} from './referenceMotifs';

export interface Motif { id:string; name:string; detail:string; source:string; sourceName:string; root:Point; height:number; outline:string; folds:string }
// Authored cubic silhouettes. Keep source coordinates so corrections can be
// compared directly with each study; placement normalizes at the narrow root.
export const motifs: Motif[] = [
  { id:'returning-leaf', name:'Returning leaf', detail:'Full belly · two body lobes', source:'/references/leaf-studies.png', sourceName:'Recovered leaf studies + approved SVG construction', root:{x:60,y:86},height:74,
    outline:'M 60 86 C 40 84 21 76 16 58 C 12 44 15 29 23 26 C 25 25 27 26 28 28 C 32 21 43 26 46 20 C 48 16 44 16 44 14 C 45 11 50 15 51 19 C 55 30 51 43 43 48 C 39 51 35 51 34 54 C 39 51 45 52 45 56 C 45 60 40 60 39 62 C 36 69 47 79 60 86 Z',
    folds:'M 53 81 C 36 76 23 63 22 49 C 21 41 23 34 25 32 M 49 78 C 36 68 28 58 29 47 C 30 36 41 33 47 24 M 39 68 C 35 63 34 59 35 57 M 35 42 C 38 37 43 36 46 30' },
  { id:'rolled-fan', name:'Rolled fan', detail:'Broad crown · inward returns',source:'/references/study-09.png',sourceName:'Approved study 09 · upper leaf family',root:{x:82,y:90},height:77,
    outline:'M 82 90 C 63 85 50 72 39 61 C 30 53 20 55 17 48 C 14 43 17 38 21 39 C 24 40 22 43 24 44 C 30 42 29 34 24 31 C 19 28 15 31 14 34 C 8 27 12 18 20 17 C 24 16 28 17 31 18 C 32 11 42 12 48 16 C 50 11 58 15 59 20 C 64 14 71 16 71 22 C 71 27 65 28 64 32 C 71 28 78 29 79 35 C 81 42 75 46 70 44 C 73 43 73 40 70 39 C 65 38 62 44 62 50 C 62 67 72 81 82 90 Z',
    folds:'M 72 79 C 56 62 45 37 40 23 M 55 60 C 43 48 37 36 24 24 M 59 58 C 56 46 56 34 58 26' },
  { id:'leaf-volute',name:'Leaf volute',detail:'Open curl · broad inner leaf',source:'/references/study-08.png',sourceName:'Approved study 08 · open circular sweep',root:{x:75,y:88},height:78,
    outline:'M 75 88 C 45 89 15 72 12 46 C 9 25 24 10 42 11 C 62 11 71 28 66 43 C 62 55 47 59 39 51 C 34 46 35 39 40 37 C 44 35 48 37 47 40 C 43 39 40 43 43 47 C 48 53 58 48 59 40 C 61 30 51 23 43 27 C 40 29 41 32 38 33 C 35 34 32 31 33 29 C 23 35 27 47 32 51 C 29 53 27 52 25 51 C 29 65 44 77 58 80 C 64 82 70 83 75 88 Z',
    folds:'M 66 84 C 40 78 21 61 19 44 C 17 29 28 18 41 18 M 45 19 C 56 19 64 29 62 38' },
  ...referenceMotifs,
];

type Token = { command:'M'|'C'|'Z'; points:Point[] };
function parsePath(d:string): Token[] {
  const bits=d.match(/[MCZ]|-?\d*\.?\d+/g)!;
  const result:Token[]=[];
  for(let i=0;i<bits.length;) {
    const command=bits[i++] as Token['command'];
    const count=command==='M'?1:command==='C'?3:0;
    const points:Point[]=[];
    for(let k=0;k<count;k++) points.push({x:Number(bits[i++]),y:Number(bits[i++])});
    result.push({command,points});
  }
  return result;
}
export function flattenPath(d:string,steps=12):Point[][] {
  const paths:Point[][]=[];let current:Point[]=[];let start:Point={x:0,y:0};
  for(const token of parsePath(d)) {
    if(token.command==='M'){if(current.length)paths.push(current);start=token.points[0];current=[start];}
    if(token.command==='C'){
      const p=current.at(-1)!, [a,b,c]=token.points;
      for(let j=1;j<=steps;j++){const t=j/steps,s=1-t;current.push({x:s*s*s*p.x+3*s*s*t*a.x+3*s*t*t*b.x+t*t*t*c.x,y:s*s*s*p.y+3*s*s*t*a.y+3*s*t*t*b.y+t*t*t*c.y});}
    }
    if(token.command==='Z'&&current.length)current.push(start);
  }
  if(current.length)paths.push(current);
  return paths;
}
export function mapPath(d:string,map:(p:Point)=>Point):string {
  return parsePath(d).map(t=>`${t.command} ${t.points.map(p=>{const q=map(p);return `${q.x.toFixed(3)} ${q.y.toFixed(3)}`;}).join(' ')}`).join(' ');
}
export function controlPoints(d:string):Point[] { return parsePath(d).flatMap(t=>t.points); }
