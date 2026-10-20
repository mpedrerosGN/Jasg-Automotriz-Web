const fs = require('node:fs');
const path = require('node:path');
// Defense in depth: build hooks can bypass Netlify's ignore command.
if (process.env.NETLIFY && (process.env.BRANCH || '').startsWith('pruebas/')) {
    throw new Error('Esta rama es solo para pruebas en GitHub; despliegue Netlify bloqueado.');
}
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
// Explicit public assets only: never publish tests, server code, credentials or tooling.
for (const name of ['index.html', 'admin.html', 'login.html', 'auth.js', 'supabase-client.js', 'supabase-data.js', 'site-branding.js', 'vehicle-gallery.js', 'analytics.js', 'analytics-dashboard.js', 'assets', 'enlaces']) {
    fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}
for (const name of ['autofact.js','autofact.css','autofact-store.mjs','autofact-viewer.html','autofact-viewer.mjs']) fs.copyFileSync(path.join(root,name),path.join(output,name));
const vendor=path.join(output,'vendor/pdfjs');fs.mkdirSync(vendor,{recursive:true});
for(const name of ['pdf.mjs','pdf.worker.mjs']) fs.copyFileSync(path.join(root,'node_modules/pdfjs-dist/legacy/build',name),path.join(vendor,name));
for(const name of ['cmaps','standard_fonts','wasm','LICENSE']) fs.cpSync(path.join(root,'node_modules/pdfjs-dist',name),path.join(vendor,name),{recursive:true});
console.log('Public site prepared in dist/');
