import {type Layout,placedPaths} from './model';
import {generateGrowth,defaultGrowth} from './growth';
import {flattenPath} from './library';
import {inside,intersection,lerp,polyPath,unionOutline} from './outlineUnion';
import type {Point} from './geometry';
type Join={collar:Point[];stems:Point[][]};
/** Split at actual intersections, retaining an open attachment at the root. */
export function visibleLines(lines:Point[][],covers:Point[][],joins:Join[]=[]):string {
 const result:string[]=[];
 const boundaries=[...covers,...joins.flatMap(j=>[j.collar,...j.stems])];
 for(const line of lines){let run:Point[]=[];const flush=()=>{if(run.length>1)result.push(polyPath(run));run=[];};
  for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],cuts=[0,1];
   for(const poly of boundaries)for(let j=0;j<poly.length;j++){const t=intersection(a,b,poly[j],poly[(j+1)%poly.length]);if(t!==null)cuts.push(t);}
   cuts.sort((a,b)=>a-b);
   for(let j=1;j<cuts.length;j++){if(cuts[j]-cuts[j-1]<1e-8)continue;const start=lerp(a,b,cuts[j-1]),end=lerp(a,b,cuts[j]),mid=lerp(start,end,.5);
    if(covers.some(p=>inside(mid,p))||joins.some(join=>inside(mid,join.collar)&&join.stems.some(p=>inside(mid,p))))flush();else {if(!run.length)run.push(start);run.push(end);}
   }
  }flush();
 }return result.join(' ');
}
// unionOutline emits only M/L polylines with fixed decimal coordinates.
const unionLines=(polygons:Point[][])=>unionOutline(polygons).split('M ').filter(Boolean).map(run=>{const n=run.match(/-?\d+(?:\.\d+)?/g)!.map(Number);return Array.from({length:n.length/2},(_,i)=>({x:n[i*2],y:n[i*2+1]}));});
/** Layer order changes visible strokes, never the editable source geometry. */
export function joinedManualDrawing(layout:Layout){
 const stems=layout.joinManual?generateGrowth(layout,layout.growth??defaultGrowth).parts:[];
 const stemPolygons=stems.map(p=>p.polygon);
 const manual=layout.items.map(item=>{const p=placedPaths(layout,item),radius=item.length*.12;return {top:item.onTop??false,polygons:flattenPath(p.outline,20),folds:p.folds?flattenPath(p.folds,24):[],join:layout.joinManual?{stems:stemPolygons,collar:Array.from({length:32},(_,i)=>({x:p.root.x+radius*Math.cos(i/32*Math.PI*2),y:p.root.y+radius*Math.sin(i/32*Math.PI*2)}))}:undefined};});
 const layers=[...manual.filter(p=>!p.top),{polygons:stemPolygons,folds:stems.flatMap(p=>p.folds),join:undefined},...manual.filter(p=>p.top)];
 const outlines:string[]=[],folds:string[]=[];
 layers.forEach((layer,i)=>{const covers=layers.slice(i+1).flatMap(l=>l.polygons);const joins=layer.polygons===stemPolygons?manual.filter(p=>!p.top&&p.join).map(p=>({collar:p.join!.collar,stems:p.polygons})):layer.join&&("top" in layer&&layer.top)?[layer.join]:[];outlines.push(visibleLines(unionLines(layer.polygons),covers,joins));folds.push(visibleLines(layer.folds,covers,joins));});
 return {outline:outlines.join(' '),folds:folds.join(' ')};
}
