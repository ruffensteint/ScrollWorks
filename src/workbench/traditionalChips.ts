import type {Point} from './geometry';
import type {ChipSettings} from './chip';
/** Sector and repeat constructions derived from the user's three SVG sheets.
 * Circular geometry is preserved; the grid sets radii and repeat dimensions. */
export function traditionalChips(s:ChipSettings):Point[][]{
 const g=s.grid??5,c=Math.floor(s.size/g/2)*g,n=Math.floor(s.size/g),radius=Math.max(g,(Math.floor(n/2)-1)*g),out:Point[][]=[];
 const seed=s.seed??1248,petals=[6,8,10,12][seed%4],style=Math.floor(seed/4)%3;
 const lens=(a:Point,b:Point,width:number,faceted=true)=>{const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
  const top:Point[]=[],bottom:Point[]=[];for(let j=0;j<=20;j++){const t=j/20,bulge=Math.sin(Math.PI*t)*width;top.push({x:a.x+dx*t+nx*bulge,y:a.y+dy*t+ny*bulge});bottom.push({x:a.x+dx*t-nx*bulge,y:a.y+dy*t-ny*bulge});}
  if(faceted){out.push(top);out.push(bottom);}else out.push([...top,...bottom.reverse()]);
 };
 const polar=(r:number,a:number)=>({x:c+r*Math.cos(a),y:c+r*Math.sin(a)});
 if(s.family!=='border'){
  const outer=radius*.68,hub=style===1?outer*.24:0;
  for(let i=0;i<petals;i++){const a=i*2*Math.PI/petals-Math.PI/2,b=a+Math.PI/petals;
   if(s.family==='rosette'||style!==2)lens(polar(hub,a),polar(outer,a),outer*Math.sin(Math.PI/petals)*.42);
   else{const root=polar(hub,a),tip=polar(outer,a),left=polar(outer*.48,a-Math.PI/petals*.6),right=polar(outer*.48,a+Math.PI/petals*.6);out.push([root,left,tip],[root,tip,right]);}
   const r1=outer*1.1,r2=radius*.78;
   out.push([polar(r1,b-.12),polar(r2,b),polar(r1,b+.12)]);
  }
 }
 // Continuous lens/fan phrases around a square frame, with matched corner petals.
 const band=Math.min(radius*.18,Math.max(g,2*g)),lo=-radius+band,hi=radius-band;
 const repeats=Math.max(1,Math.floor((hi-lo)/(band*2))),pitch=(hi-lo)/repeats,border=(s.borderSeed??seed)%3;
 const map=(x:number,y:number,k:number):Point=>{for(let i=0;i<k;i++){const t=x;x=-y;y=t;}return {x:c+x,y:c+y};};
 for(let k=0;k<4;k++){
  for(let i=0;i<repeats;i++){const x=lo+i*pitch,a=map(x,-radius+band/2,k),b=map(x+pitch,-radius+band/2,k);
   if(border===0)lens(a,b,band*.42);
   else if(border===1){const mid=map(x+pitch/2,-radius,k),base=map(x+pitch/2,-radius+band,k);lens(a,mid,band*.16);lens(mid,b,band*.16);out.push([a,base,b]);}
   else{lens(a,b,band*.32,false);const mid=map(x+pitch/2,-radius+band/2,k);out.push([a,map(x+pitch*.3,-radius,k),mid],[mid,map(x+pitch*.7,-radius+band,k),b]);}
  }
  lens(map(-radius,-radius,k),map(-radius+band,-radius+band,k),band*.24);
 }
 return out;
}
