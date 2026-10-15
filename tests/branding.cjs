const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Blob } = require('node:buffer');
const root = path.resolve(__dirname, '..');
const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], { type: 'image/png' });

function setup(options = {}) {
    const state = { stored: options.stored || null, uploads: [], revoked: [], draw: null, sequence: 0, failUpload: false };
    const client = {
        auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: 'admin' } }, error: null }) },
        storage: { from(bucket) {
            assert.equal(bucket, 'vehicle-images');
            return {
                getPublicUrl: key => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${key}` } }),
                upload: async (key, blob, config) => {
                    if (state.failUpload) return { error: { message: 'upload failed' } };
                    state.uploads.push({ key, blob, config }); state.stored = blob;
                    return { data: { path: key }, error: null };
                }
            };
        } }
    };
    class MockImage {
        naturalWidth = options.width || 1800;
        naturalHeight = options.height || 900;
        set src(value) { queueMicrotask(() => options.corrupt ? this.onerror() : this.onload()); }
    }
    const context = {
        window: { jasgSupabase: client }, Blob, Uint8Array, Image: MockImage, Date, console,
        crypto: { randomUUID: () => `version-${++state.sequence}` },
        URL: class extends URL {
            static createObjectURL() { return `blob:preview-${++state.sequence}`; }
            static revokeObjectURL(url) { state.revoked.push(url); }
        },
        document: { createElement(tag) {
            assert.equal(tag, 'canvas');
            const canvas = { width: 0, height: 0,
                getContext: () => ({ drawImage() { state.draw = [canvas.width, canvas.height]; } }),
                toBlob: callback => callback(png())
            };
            return canvas;
        } },
        fetch: async (url, config) => {
            if (options.offline) throw new Error('network unavailable');
            if (url === 'assets/jasg-logo.jpeg') return { ok: true, blob: async () => png() };
            assert.equal(config.cache, 'no-store');
            return state.stored
                ? { ok: true, status: 200, headers: { get: () => 'image/png' } }
                : { ok: false, status: 400, json: async () => ({ statusCode: '404', code: 'NoSuchKey' }) };
        }
    };
    const file = path.join(root, 'site-branding.js');
    if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: 'site-branding.js' });
    return { state, store: context.window.jasgLogoStore, component: context.window.jasgBranding, context };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('uses original logo when no shared logo has been saved', async () => {
    const { store } = setup();
    assert.equal(await store.load(), 'assets/jasg-logo.jpeg');
});
test('authenticated upload persists and a later public read returns the shared logo', async () => {
    const { store, state } = setup();
    const saved = await store.save(png());
    const visitor = setup({ anonymous: true, stored: state.stored });
    await visitor.store.load();
    const loaded = await store.load();
    assert.match(saved, /\/branding\/site-logo\.png\?v=/);
    assert.match(loaded, /\/branding\/site-logo\.png\?v=/);
    assert.notEqual(saved, loaded);
    assert.deepEqual(JSON.parse(JSON.stringify(state.uploads[0].config)), { contentType: 'image/png', cacheControl: '0', upsert: true });
});
test('anonymous users cannot upload logos', async () => {
    const { store, state } = setup({ anonymous: true });
    await assert.rejects(() => store.save(png()), /sesión/i);
    assert.equal(state.uploads.length, 0);
});
test('normalizes an uploaded logo to PNG with preserved proportions', async () => {
    const { store, state } = setup();
    const result = await store.prepare(png());
    assert.equal(result.type, 'image/png');
    assert.deepEqual(state.draw, [1024, 512]);
    assert.equal(state.revoked.length, 1);
});
test('accepts JPEG and WebP and preserves small image dimensions', async () => {
    const { store, state } = setup({ width: 100, height: 50 });
    await store.prepare(new Blob([new Uint8Array([255, 216, 255, 0])], { type: 'image/jpeg' }));
    assert.deepEqual(state.draw, [100, 50]);
    const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
    assert.equal((await store.prepare(new Blob([webp], { type: 'image/webp' }))).type, 'image/png');
});
test('rejects SVG, oversized files and misleading image extensions', async () => {
    const { store } = setup();
    await assert.rejects(() => store.prepare(new Blob(['<svg/>'], { type: 'image/svg+xml' })), /PNG|JPG|WebP/i);
    await assert.rejects(() => store.prepare(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' })), /5 MB/);
    await assert.rejects(() => store.prepare(new Blob(['not an image'], { type: 'image/png' })), /imagen/i);
});
test('rejects corrupted and excessive-resolution images and releases preview resources', async () => {
    const corrupt = setup({ corrupt: true });
    await assert.rejects(() => corrupt.store.prepare(png()), /imagen/i);
    assert.equal(corrupt.state.revoked.length, 1);
    const large = setup({ width: 10000, height: 10000 });
    await assert.rejects(() => large.store.prepare(png()), /resolución/i);
});
test('choosing a logo only previews it until save is pressed', async () => {
    const { component, state } = setup();
    const app = component();
    await app.selectLogoFile({ target: { files: [png()], value: 'logo.png' } });
    assert.match(app.logoDraftUrl, /^blob:/);
    assert.equal(app.siteLogoUrl, 'assets/jasg-logo.jpeg');
    assert.equal(state.uploads.length, 0);
    await app.saveLogo();
    assert.match(app.siteLogoUrl, /site-logo\.png/);
    assert.equal(app.logoDraftUrl, '');
    assert.equal(state.uploads.length, 1);
    assert.match(app.logoMessage, /guardado/i);
});
test('cancel discards the preview without changing the published logo', async () => {
    const { component, state } = setup();
    const app = component();
    await app.selectLogoFile({ target: { files: [png()], value: '' } });
    app.cancelLogoDraft();
    assert.equal(app.logoDraftUrl, '');
    assert.equal(app.logoDraftFile, null);
    assert.equal(state.uploads.length, 0);
});
test('upload failures keep the previous logo and draft available to retry', async () => {
    const { component, state } = setup();
    const app = component();
    await app.selectLogoFile({ target: { files: [png()], value: '' } });
    state.failUpload = true;
    await app.saveLogo();
    assert.equal(app.siteLogoUrl, 'assets/jasg-logo.jpeg');
    assert.match(app.logoDraftUrl, /^blob:/);
    assert.ok(app.logoError);
    assert.equal(app.logoSaving, false);
});
test('restoring the original logo is previewed before it is saved', async () => {
    const { component, state } = setup({ stored: png() });
    const app = component();
    await app.initBranding();
    await app.useOriginalLogo();
    assert.equal(state.uploads.length, 0);
    assert.equal(app.logoDraftName, 'Logo original');
    await app.saveLogo();
    assert.equal(state.uploads.length, 1);
});
test('loading errors preserve the original fallback without breaking the page', async () => {
    const { component } = setup({ offline: true });
    const app = component();
    await app.initBranding();
    assert.equal(app.siteLogoUrl, 'assets/jasg-logo.jpeg');
    assert.equal(app.logoLoading, false);
    assert.ok(app.logoError);
});
test('saving without a draft does not upload anything', async () => {
    const { component, state } = setup();
    const app = component();
    await app.saveLogo();
    assert.equal(state.uploads.length, 0);
});
test('busy state prevents duplicate saves and accidental cancellation', async () => {
    const { component, state } = setup();
    const app = component();
    await app.selectLogoFile({ target: { files: [png()], value: '' } });
    app.logoSaving = true;
    await app.saveLogo();
    app.cancelLogoDraft();
    assert.ok(app.logoDraftFile);
    assert.equal(state.uploads.length, 0);
});
test('failed draft preparation preserves the previous preview for retry', async () => {
    const { component } = setup();
    const app = component();
    await app.selectLogoFile({ target: { files: [png()], value: '' } });
    const preview = app.logoDraftUrl;
    await app.selectLogoFile({ target: { files: [new Blob(['bad'], { type: 'image/png' })], value: '' } });
    assert.equal(app.logoDraftUrl, preview);
    assert.ok(app.logoError);
    assert.equal(app.logoPreparing, false);
});
test('public and admin pages initialize branding and bind every static logo', () => {
    for (const page of ['index.html', 'admin.html']) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        assert.match(html, /src="site-branding\.js\?v=1"/);
        assert.match(html, /\.\.\.window\.jasgBranding\(\)/);
        assert.match(html, /void this\.initBranding\(\)/);
        const logos = [...html.matchAll(/<img\s[^>]*src="assets\/jasg-logo\.jpeg"[^>]*>/g)];
        assert.equal(logos.length, 2);
        logos.forEach(([tag]) => assert.match(tag, /:src="siteLogoUrl"/));
    }
    const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
    assert.match(login, /jasgLogoStore\.load\(\)/);
});

module.exports = async function run() {
    const results = [];
    for (const { name, run } of tests) {
        try { await run(); results.push({ name, pass: true }); }
        catch (error) { results.push({ name, pass: false, error: error.message }); }
    }
    return results;
};
if (require.main === module) module.exports().then(results => {
    for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`);
    process.exitCode = results.some(result => !result.pass) ? 1 : 0;
});
