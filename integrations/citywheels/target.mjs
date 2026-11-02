import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

export const root = resolve(process.env.CITYWHEELS_ROOT ?? '/Users/gora/AI_Project/EternalChat copy/help-desk-agent/help-desk-agent');
const bridge = fileURLToPath(new URL('./bridge.py', import.meta.url));
const identity = createHash('sha256');
async function fingerprint(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== '__pycache__') await fingerprint(path);
    else if (entry.isFile() && /\.(py|md|json)$/.test(entry.name)) identity.update(path.slice(root.length)).update(await readFile(path));
  }
}
await fingerprint(join(root, 'citywheels')); await fingerprint(join(root, 'data'));
identity.update(await readFile(bridge));identity.update(await readFile(fileURLToPath(import.meta.url)));
export const target = {
  name: 'CityWheels / actual agent / offline fake provider', revision: identity.digest('hex'),
  execute({ input }, { signal }) {
    return new Promise((resolveOutput,reject)=>{
      const child = spawn(process.env.CITYWHEELS_PYTHON ?? 'python3', ['-B',bridge,root], {
        signal, stdio:['pipe','pipe','pipe'], env:{PATH:process.env.PATH, PYTHONIOENCODING:'utf-8', PYTHONDONTWRITEBYTECODE:'1'},
      });
      let out='',err='';
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stdout.on('data',chunk=>{out+=chunk;if(out.length>2_000_000)child.kill();});
      child.stderr.on('data',chunk=>{err=(err+chunk).slice(-4000);});
      child.on('error',reject);child.stdin.on('error',()=>{});
      child.on('close',code=>{if(code!==0)return reject(new Error('CityWheels bridge failed: '+err));try{resolveOutput(JSON.parse(out));}catch(error){reject(error);}});
      child.stdin.end(JSON.stringify(input));
    });
  },
};
