import {readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';

// Only the prepared GitHub copy is modified, never the installed app's source.
const root=resolve('release-source');
if(!existsSync(join(root,'package.json')))throw new Error('Prepare release-source first.');
const edit=(file,change)=>{const path=join(root,file);writeFileSync(path,change(readFileSync(path,'utf8')));};
edit('src/main.tsx',s=>s.replace(/^import \{InstallApp\} from '.\/InstallApp';\r?\n/m,'').replace('<InstallApp/>',''));
edit('index.html',s=>s.replace(/^.*rel="manifest".*\r?\n/m,'').replace('on your device, online or offline.','in your browser.'));
edit('package.json',s=>{const p=JSON.parse(s);p.scripts.build='tsc -b && vite build';return JSON.stringify(p,null,2)+'\n';});
for(const file of ['src/InstallApp.tsx','public/manifest.webmanifest','scripts/build-offline.mjs','scripts/service-worker.js','scripts/test-offline.mjs'])rmSync(join(root,file),{force:true});
edit('README.md',s=>s.includes('browser-only edition')?s:s+'\nThe GitHub source release is a browser-only edition: it has no app-install button, PWA manifest, or offline service worker.\n');
console.log('GitHub copy uses browser-only startup and build.');
