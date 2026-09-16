import type {Point} from './geometry';
export const borderNames=['Diamond chain','Paired chevrons','Braided band','Alternating rosettes','Stepped ribbon','Paired fans'];
/** Each phrase occupies its own rectangle, repeated continuously on all sides.
 * Corners use the same band depth. Coordinates are integer grid units. */
export function borderPhrases(radius:number,seed:number):Point[][]{
 const out:Point[][]=[],style=((seed%6)+6)%6,depth=radius>=8?3:radius>=5?2:1;
 const pitch=depth===3?6:4,corner=depth,available=radius*2-corner*2;
 const count=Math.floor(available/pitch),start=-Math.floor(count*pitch/2);
 const add=(coords:number[][],x:number)=>out.push(coords.map(([a,b])=>({x:x+a,y:-radius+b})));
 if(depth===3){for(let i=0;i<count;i++){const x=start+i*pitch;
  if(style===0){add([[0,1],[2,0],[4,1],[2,3]],x);add([[4,1],[5,0],[6,1],[5,2]],x);}
  if(style===1){add([[0,0],[2,0],[4,2],[2,2]],x);add([[2,3],[4,1],[6,1],[4,3]],x);}
  if(style===2){add([[0,0],[2,0],[4,2],[2,2]],x);add([[0,3],[1,2],[2,3]],x);add([[3,1],[4,0],[6,2],[6,3]],x);}
  if(style===3){add([[0,1],[1,0],[2,1],[1,2]],x);add([[2,1],[4,0],[6,1],[4,3]],x);add([[2,3],[3,2],[4,3]],x);}
  if(style===4){add([[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]],x);add([[2,3],[5,3],[5,2],[3,2],[3,1],[2,1]],x);}
  if(style===5){add([[0,0],[3,0],[3,2]],x);add([[0,1],[0,3],[2,3]],x);add([[3,3],[6,3],[6,1]],x);add([[4,0],[6,0],[6,2]],x);}
 }}else for(let i=0;i<count;i++){const x=start+i*pitch;
  if(style%2===0){add([[0,depth/2===1?1:0],[2,0],[4,depth/2===1?1:0],[2,depth]],x);}
  else{add([[0,0],[2,0],[1,depth]],x);add([[2,depth],[4,depth],[3,0]],x);}
 }
 // Corner medallions fill the reserved square without invading either side.
 if(depth>=2){const x=-radius;add([[0,1],[1,0],[2,1],[1,2]],x);if(depth===3){add([[1,2],[2,1],[3,2],[2,3]],x);}}
 else add([[0,0],[1,0],[0,1]],-radius);
 return out;
}
