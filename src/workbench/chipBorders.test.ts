import {it,expect} from 'vitest';
import {borderPhrases} from './chipBorders';
import {composeChips} from './chipComposition';
import {defaultChip,validChip} from './chip';
it('builds six different grid-aligned border families',()=>{const designs=[];for(let seed=0;seed<6;seed++){const p=borderPhrases(24,seed);designs.push(JSON.stringify(p));for(const chip of p){expect(validChip(chip)).toBe(true);for(const q of chip){expect(Number.isInteger(q.x)&&Number.isInteger(q.y)).toBe(true);expect(q.x).toBeGreaterThanOrEqual(-24);expect(q.x).toBeLessThanOrEqual(24);expect(q.y).toBeGreaterThanOrEqual(-24);expect(q.y).toBeLessThanOrEqual(-21);}}}expect(new Set(designs).size).toBe(6);});
it('border-only variation preserves the center exactly',()=>{const s={...defaultChip,grid:2};const center=(seed:number)=>composeChips({...s,borderSeed:seed}).filter(poly=>poly.every(p=>p.x>10&&p.x<90&&p.y>10&&p.y<90));for(let seed=1;seed<6;seed++)expect(center(seed)).toEqual(center(0));});
