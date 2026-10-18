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

test('HTTP handles valid collection, privacy, preview, authentication and outages', async () => {
    const { collect, stats } = await import('../lib/analytics-http.mjs');
    const store = storeMock();
    const ctx = { ...context, deploy: { context: 'production', published: true } };
    const request = (data = body, extraHeaders = {}) => new Request('https://site.test/api/analytics/event', { method: 'POST', headers: { origin: 'https://site.test', 'content-type': 'application/json', ...extraHeaders }, body: JSON.stringify(data) });
    assert.equal((await collect(request(), ctx, () => store)).status, 200);
    assert.equal((await collect(request(), { deploy: { context: 'deploy-preview' } }, () => store)).status, 202);
    assert.equal((await collect(request(body, { dnt: '1' }), ctx, () => store)).status, 202);
    assert.equal((await collect(request(body, { 'user-agent': 'crawler' }), ctx, () => store)).status, 202);
    assert.equal((await collect(request(body, { 'content-type': 'text/plain' }), ctx, () => store)).status, 415);
    assert.equal((await collect(request({ data: 'a'.repeat(2050) }), ctx, () => store)).status, 413);
    assert.equal((await collect(new Request('https://site.test'), ctx, () => store)).status, 405);
    assert.equal((await collect(request(), ctx, () => { throw new Error('secret'); })).status, 503);
    const adminRequest = days => new Request(`https://site.test/api/analytics/stats?days=${days}`, { headers: { authorization: 'Bearer test-token' } });
    const authenticated = async () => new Response(JSON.stringify({ id: 'real-auth-user' }));
    const response = await stats(adminRequest(1), () => store, authenticated);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.pageViews, 1);
    assert.equal(result.visits, 1);
    assert.doesNotMatch(JSON.stringify(result), /11111111|22222222/);
    assert.equal((await stats(adminRequest(999), () => store, authenticated)).status, 400);
    assert.equal((await stats(adminRequest(7), () => store, async () => new Response('{}', { status: 401 }))).status, 401);
    assert.equal((await stats(adminRequest(7), () => store, async () => { throw new Error('secret'); })).status, 503);
    assert.equal((await stats(new Request('https://site.test', { method: 'POST' }), () => store)).status, 405);
});

test('counts link destinations and reports storage capacity/conflict honestly', async () => {
    const store = storeMock();
    const event = core.normalizeEvent({ ...body, type: 'link_click', target: 'instagram' }, context, now);
    await core.recordEvent(store, event);
    assert.equal((await core.readStats(store, 1, now)).links.instagram, 1);
    await assert.rejects(() => core.recordEvent({ getWithMetadata: async () => null, setJSON: async () => ({ modified: false }) }, event), /conflict/);
    const seen = Object.fromEntries(Array.from({length:5000}, (_, i) => [String(i), true]));
    await assert.rejects(() => core.recordEvent({getWithMetadata: async () => ({data:{seen}})}, event), /capacity/);
});

const vm = require('node:vm');
test('comparison keeps periods separate and diagnostic never reads or writes storage', async () => {
    const store = storeMock();
    await core.recordEvent(store, core.normalizeEvent(body, context, now));
    const report = await core.readReport(store, 7, now);
    assert.equal(report.visits, 1);
    assert.equal(report.previous.visits, 0);
    assert.equal(report.period.to, '2026-10-17');
    const { stats } = await import('../lib/analytics-http.mjs');
    const request = new Request('https://site.test/api/analytics/stats?diagnostic=1', {headers:{authorization:'Bearer test'}});
    const response = await stats(request, () => { throw new Error('Diagnostic must not use storage'); }, async()=>new Response('{"id":"admin"}'), context);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.country, 'CL');
    assert.equal(result.counted, false);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});
test('new session funnel deduplicates repeated WhatsApp and campaign counts', async () => {
    const store = storeMock();
    for (let i=0;i<3;i++) await core.recordEvent(store, core.normalizeEvent({...body,id:`0000000${i}-1111-4111-8111-111111111111`,type:i?'whatsapp_click':'page_view',campaign:'octubre'},context,now));
    const result = await core.readStats(store,1,now);
    assert.equal(result.measuredSessions,1);
    assert.equal(result.contactSessions,1);
    assert.equal(result.whatsappClicks,2);
    assert.equal(result.campaigns.c_octubre,1);
});
test('vehicle contact rate counts only sessions with both detail and WhatsApp', async () => {
    const store = storeMock();
    for (let i=0;i<3;i++) await core.recordEvent(store,core.normalizeEvent({...body,id:`0000000${i}-1111-4111-8111-111111111111`,type:i?'whatsapp_click':'vehicle_view',vehicleId:body.id},context,now));
    const result = await core.readStats(store,1,now);
    assert.deepEqual(result.vehicleEngagement[body.id],{viewSessions:1,contactSessions:1,viewContactSessions:1});
});
function browserFixture(options = {}) {
    const sent = [], listeners = {}, storage = new Map();
    const fixture = { window: {}, location: { pathname: '/', hostname: 'site.test', href: 'https://site.test/' }, navigator: { userAgent: options.agent || 'Desktop', doNotTrack: options.dnt ? '1' : '0' },
        document: { referrer: options.referrer || '', addEventListener: (name, fn) => { listeners[name] = fn; }, querySelectorAll: () => [] },
        crypto: require('node:crypto').webcrypto, URL, Date, sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        fetch: async (url, config) => { sent.push(JSON.parse(config.body)); return {}; } };
    fixture.window.jasgSupabase = { auth: { getSession: async () => ({ data: { session: options.admin ? {} : null } }) } };
    vm.createContext(fixture);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../analytics.js'), 'utf8'), fixture, { filename: 'analytics.js' });
    return { ...fixture, sent, listeners, storage };
}
test('browser sends real events with one session and preserves source', async () => {
    const browser = browserFixture({ referrer: 'https://www.instagram.com/?private=secret', agent: 'Android Mobile' });
    await browser.window.jasgAnalytics.track('page_view');
    await browser.window.jasgAnalytics.track('vehicle_view', { vehicleId: body.id });
    assert.equal(browser.sent.length, 2);
    assert.equal(browser.sent[0].session, browser.sent[1].session);
    assert.equal(browser.sent[0].source, 'instagram');
    assert.equal(browser.sent[0].device, 'mobile');
    assert.doesNotMatch(JSON.stringify(browser.sent), /secret/);
    browser.storage.clear();
    browser.listeners.DOMContentLoaded();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(browser.sent.length, 3);
});
test('browser excludes authenticated admins and do-not-track visitors', async () => {
    for (const options of [{ admin: true }, { dnt: true }]) {
        const browser = browserFixture(options);
        await browser.window.jasgAnalytics.track('page_view');
        assert.equal(browser.sent.length, 0);
    }
});
test('dashboard reads protected real data and displays errors instead of fake zeros', async () => {
    const browser = {window: {}, Intl, Date, AbortSignal, fetch: async () => new Response(JSON.stringify({visits:2,countries:{CL:2},vehicles:{[body.id]:{views:3,whatsapp:1}},daily:[{visits:2}]}))};
    browser.window.jasgSupabase = {auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}};
    vm.createContext(browser);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../analytics-dashboard.js'),'utf8'), browser, {filename:'analytics-dashboard.js'});
    const dashboard = browser.window.jasgAnalyticsDashboard();
    dashboard.vehicles = [{id:body.id,brand:'JASG',model:'Test',year:2026}];
    await dashboard.loadAnalytics();
    assert.equal(dashboard.analytics.visits, 2);
    assert.equal(dashboard.analyticsRows('countries')[0].label, 'Chile');
    assert.equal(dashboard.analyticsVehicles[0].views, 3);
    assert.equal(dashboard.analyticsBar(1), '50%');
    assert.ok(dashboard.analyticsDate(now.toISOString()));
    browser.fetch = async () => new Response('{}', {status:503});
    await dashboard.loadAnalytics();
    assert.equal(dashboard.analytics, null);
    assert.match(dashboard.analyticsError, /No se pudieron/);
    browser.window.jasgSupabase.auth.getSession = async()=>({data:{session:null}});
    await dashboard.loadAnalytics();
    assert.match(dashboard.analyticsError, /sesión/);
});
