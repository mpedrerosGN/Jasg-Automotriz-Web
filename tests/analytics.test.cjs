const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const corePath = path.join(__dirname, '../lib/analytics.cjs');
const core = fs.existsSync(corePath) ? require(corePath) : {};
const now = new Date('2026-10-17T15:00:00Z');
const context = { geo: { country: { code: 'CL' }, city: 'PRIVATE', latitude: 1 }, ip: 'PRIVATE' };
const body = { id: '11111111-1111-4111-8111-111111111111', session: '22222222-2222-4222-8222-222222222222', type: 'page_view', page: 'catalog', source: 'instagram', device: 'mobile' };
function storeMock() {
    const data = new Map(); let version = 0;
    return {
        data,
        async get(key) { return data.has(key) ? structuredClone(data.get(key).data) : null; },
        async getWithMetadata(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
        async setJSON(key, value, options = {}) {
            const existing = data.get(key);
            if ((options.onlyIfNew && existing) || (options.onlyIfMatch && existing?.etag !== options.onlyIfMatch)) return { modified: false };
            data.set(key, { data: structuredClone(value), etag: String(++version) });
            return { modified: true };
        }
    };
}
test('normalizes country from server, ignores IP and browser-supplied country', () => {
    const event = core.normalizeEvent({ ...body, country: 'US', ip: 'SECRET' }, context, now);
    assert.equal(event.country, 'CL');
    assert.equal(event.day, '2026-10-17');
    assert.doesNotMatch(JSON.stringify(event), /PRIVATE|SECRET|latitude|city|ip"/);
});
test('invalid identifiers, page, event, source and vehicle references are rejected', () => {
    for (const change of [{ id: '../bad' }, { session: '__proto__' }, { type: 'delete' }, { page: 'admin' }, { source: 'https://secret.example/?token=secret' }, { type: 'vehicle_view', vehicleId: 'bad' }]) {
        assert.throws(() => core.normalizeEvent({ ...body, ...change }, context, now));
    }
});
test('country unavailable is unknown, never inferred as Chile', () => {
    assert.equal(core.normalizeEvent(body, {}, now).country, 'ZZ');
});
test('uses Chile calendar day instead of UTC near midnight', () => {
    assert.equal(core.dayKey(new Date('2026-10-17T01:00:00Z')), '2026-10-16');
});
test('stores real events once, counts one session across reloads and both pages', async () => {
    const store = storeMock();
    const first = core.normalizeEvent(body, context, now);
    await core.recordEvent(store, first);
    await core.recordEvent(store, first);
    await core.recordEvent(store, core.normalizeEvent({ ...body, id: '33333333-3333-4333-8333-333333333333', page: 'links' }, context, now));
    const stats = await core.readStats(store, 7, now);
    assert.equal(stats.visits, 1);
    assert.equal(stats.pageViews, 2);
    assert.equal(stats.countries.CL, 1);
    assert.equal(stats.sources.instagram, 1);
    assert.equal(stats.pages.links, 1);
});
test('counts vehicle openings and WhatsApp clicks independently', async () => {
    const store = storeMock(), vehicleId = '44444444-4444-4444-8444-444444444444';
    for (const [id, type] of [['55555555-5555-4555-8555-555555555555', 'vehicle_view'], ['66666666-6666-4666-8666-666666666666', 'whatsapp_click']]) {
        await core.recordEvent(store, core.normalizeEvent({ ...body, id, type, vehicleId }, context, now));
    }
    const stats = await core.readStats(store, 1, now);
    assert.equal(stats.vehicleClicks, 1);
    assert.equal(stats.whatsappClicks, 1);
    assert.deepEqual(stats.vehicles[vehicleId], { views: 1, whatsapp: 1 });
});
test('concurrent writes do not lose counts and retry safely', async () => {
    const store = storeMock();
    await Promise.all(Array.from({ length: 5 }, (_, i) => core.recordEvent(store, core.normalizeEvent({ ...body, id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111` }, context, now))));
    const stats = await core.readStats(store, 1, now);
    assert.equal(stats.pageViews, 5);
    assert.equal(stats.visits, 1);
});
test('empty stats are real zero counts, with no example traffic', async () => {
    const stats = await core.readStats(storeMock(), 30, now);
    assert.equal(stats.visits, 0);
    assert.equal(stats.startedAt, null);
    assert.deepEqual(stats.countries, {});
    assert.equal(stats.daily.length, 30);
});
test('periods are restricted and do not include older events', async () => {
    const store = storeMock();
    await core.recordEvent(store, core.normalizeEvent(body, context, new Date('2026-10-01T15:00:00Z')));
    assert.equal((await core.readStats(store, 7, now)).visits, 0);
    assert.equal((await core.readStats(store, 30, now)).visits, 1);
    await assert.rejects(() => core.readStats(store, 999, now));
});

test('browser integration tracks public openings and provides protected dashboard', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const admin = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
    assert.match(index, /jasgAnalytics\?\.track\('vehicle_view'/);
    assert.match(admin, /jasgAnalyticsDashboard\(\)/);
    assert.ok(fs.existsSync(path.join(__dirname, '../analytics.js')));
});

test('HTTP rejects unauthorized reads and invalid collection without touching storage', async () => {
    const { collect, stats } = await import('../lib/analytics-http.mjs');
    const blocked = () => { throw new Error('Must not access storage'); };
    assert.equal((await stats(new Request('https://site.test/api/analytics/stats'), blocked)).status, 401);
    assert.equal((await collect(new Request('https://site.test/api/analytics/event', { method: 'POST', body: '{}' }), {}, blocked)).status, 403);
    const request = new Request('https://site.test/api/analytics/event', { method: 'POST', headers: { origin: 'https://site.test', 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await collect(request, { deploy: { context: 'production', published: true } }, blocked)).status, 400);
});
