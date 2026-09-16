import {readdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const records=new Map();
function packages(dir){if(!existsSync(dir))return;for(const e of readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=join(dir,e.name);if(e.name.startsWith('@')){packages(p);continue;}const manifest=join(p,'package.json');if(!existsSync(manifest))continue;const m=JSON.parse(readFileSync(manifest,'utf8'));const key=m.name+'@'+m.version;if(records.has(key))continue;const notices=readdirSync(p).filter(n=>/^(licen[sc]e|copying|notice)(\.|$|-)/i.test(n));records.set(key,{license:m.license??'UNDECLARED',text:notices.map(n=>{try{return readFileSync(join(p,n),'utf8')}catch{return ''}}).join('\n')});}}
packages('node_modules');
if(existsSync('node_modules/.pnpm'))for(const e of readdirSync('node_modules/.pnpm'))packages(join('node_modules/.pnpm',e,'node_modules'));
let out='# Third-party dependency notices\n\nInstalled dependency inventory, including development tools and platform packages. These components retain their own licenses. Regenerate with `node scripts/dependency-notices.mjs` after dependency changes.\n\n';
for(const [name,r] of [...records].sort())out+=`## ${name}\n\nDeclared license: ${typeof r.license==='string'?r.license:JSON.stringify(r.license)}\n\n${r.text?'```text\n'+r.text+'\n```':'No root license text found; consult this package’s distribution before release.'}\n\n`;
writeFileSync('THIRD_PARTY_NOTICES.md',out);console.log(`${records.size} dependency records; ${[...records.values()].filter(r=>!r.text).length} without root license text.`);
