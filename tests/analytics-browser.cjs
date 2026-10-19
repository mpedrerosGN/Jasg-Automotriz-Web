// Isolated browser test: all statistics and authentication are local fixtures.
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fixture = { visits: 2, pageViews: 3, vehicleClicks: 1, whatsappClicks: 1, countries: { CL: 2 }, sources: { instagram: 2 }, devices: { mobile: 2 }, vehicles: {}, links: { instagram: 1 }, daily: [{ day: '2026-10-17', visits: 2 }], startedAt: '2026-10-17T15:00:00Z', updatedAt: '2026-10-17T15:00:00Z' };
(async () => {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
        try { response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'); response.end(fs.readFileSync(file)); }
        catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
            const page = await browser.newPage({ viewport });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/supabase-client.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.jasgSupabase = {auth:{getSession:async()=>({data:{session:{access_token:"local-test"}}})}};' }));
            await page.route('**/supabase-data.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.jasgDb = {listVehicles:async()=>[],listBrands:async()=>[],listEquipment:async()=>[]};' }));
            let fail = false, statsRequests = 0;
            await page.route('**/api/analytics/stats*', route => {
                assert.equal(route.request().headers().authorization, 'Bearer local-test');
                if (route.request().url().includes('diagnostic=1')) return route.fulfill({contentType:'application/json',body:JSON.stringify({country:'CL',counted:false})});
                statsRequests++;
                return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fixture) });
            });
            await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`, { waitUntil: 'networkidle' });
            assert.equal(statsRequests,0,'Catalogue must not fetch dashboard statistics');
            await page.evaluate(() => { Alpine.$data(document.body).currentView = 'dashboard'; });
            const section = page.locator('[aria-labelledby="analytics-heading"]');
            await section.getByText('Chile', { exact: true }).waitFor();
            assert.equal(await section.getByText('Visitas (sesiones)').count(), 1);
            await section.locator('#analytics-period').selectOption('7');
            await section.getByText('Chile', { exact: true }).waitFor();
            await section.getByRole('button', {name:'Comprobar mi país detectado'}).click();
            await section.getByText('País detectado ahora: Chile', {exact:true}).waitFor();
            assert.equal(await section.getByText('Tasa de clic de contacto', {exact:true}).count(),1);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            await section.screenshot({ path: path.join(root, '.tools', `analytics-${viewport.width}.png`) });
            fail = true;
            await section.getByRole('button', { name: 'Actualizar', exact: true }).click();
            await section.getByRole('alert').waitFor();
            assert.match(await section.getByRole('alert').innerText(), /No se pudieron/);
            assert.deepEqual(errors, []);
            console.log(`PASS dashboard ${viewport.width}px: real-data binding, period filter, auth header, error state, no page overflow`);
            await page.close();
        }
    } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
