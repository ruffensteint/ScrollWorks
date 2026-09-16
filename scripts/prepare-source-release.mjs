import {readdirSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
// Explicit allowlist: never copy private hosting metadata or existing Git history.
const root='release-source';
if(existsSync(root))throw new Error('release-source already exists. Review or rename it before preparing another snapshot.');
mkdirSync(root);
const files=['README.md','LICENSE','COPYING.md','BRANDING.md','CONTRIBUTING.md','RELEASE_AUDIT.md','THIRD_PARTY_NOTICES.md','package.json','pnpm-lock.yaml','index.html','tsconfig.json','tsconfig.app.json','tsconfig.node.json','vite.config.ts'];
function copy(path){const dest=join(root,path);if(!/\.(tsx?|css|json|html|yaml|md|mjs|js|svg|png|webmanifest)$/.test(path)&&path!=='LICENSE')return;mkdirSync(join(dest,'..'),{recursive:true});copyFileSync(path,dest);}
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p);else copy(p);}}
files.forEach(copy);['src','scripts','public/icons'].forEach(walk);
// Source-study images are deliberately absent. Remove dead links in this copy only.
const workbench=join(root,'src/workbench/Workbench.tsx');
let ui=readFileSync(workbench,'utf8');
ui=ui.replace(/<a\b[^>]*href=\{motif\.source\}[^>]*>[\s\S]*?<\/a>/g,'');
ui=ui.replace(/<button className="wb-source-link"[^>]*onClick=\{\(\)=>setSource\(m.id\)\}>[\s\S]*?<\/button>/g,'');
writeFileSync(workbench,ui);
await import('./browser-only-release.mjs');
writeFileSync(join(root,'.gitignore'),'node_modules/\ndist/\n.vite/\n*.tsbuildinfo\n.env*\n*.local\nreferences/\nlayouts/\n.openai/\nrelease-source/\n');
console.log('Prepared release-source with fresh-history boundaries. Reference images and personal files excluded.');
