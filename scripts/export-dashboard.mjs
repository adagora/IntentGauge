import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { dashboardHtml } from '../dist/src/dashboard-ui.js';
const path = resolve(process.argv[2] ?? 'runs/dashboard.html');
await mkdir(dirname(path), { recursive: true });
await writeFile(path, dashboardHtml, { mode: 0o600 });
console.log(path);
