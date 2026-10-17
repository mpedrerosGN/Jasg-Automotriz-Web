const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
// Explicit public assets only: never publish tests, server code, credentials or tooling.
for (const name of ['index.html', 'admin.html', 'login.html', 'auth.js', 'supabase-client.js', 'supabase-data.js', 'site-branding.js', 'vehicle-gallery.js', 'analytics.js', 'analytics-dashboard.js', 'assets', 'enlaces']) {
    fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}
console.log('Public site prepared in dist/');
