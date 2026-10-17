const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// Exercise the closing expressions declared by the actual HTML. A fullscreen
// viewer is a sibling of the detail modal, so its clicks reach document-level
// .away listeners but never bubble through the detail backdrop.
function dispatchModalClick(page, app, target) {
    const markup = read(page).split('<!-- MODAL: DETALLE DEL VEHICULO -->')[1]
        .split('<!-- Fullscreen image viewer -->')[0];
    const backdrop = markup.match(/<div\s+x-show="detailModalOpen"[^>]*>/)[0];
    for (const handler of markup.matchAll(/@click\.(?:away|outside)="([^"]+)"/g)) {
        if (target !== 'detail-content') vm.runInNewContext(handler[1], app);
    }
    if (target === 'detail-backdrop') {
        const handler = backdrop.match(/@click\.self="([^"]+)"/);
        if (handler) vm.runInNewContext(handler[1], app);
    }
    if (!app.detailModalOpen) app.notifyDetailClosed();
}

function database(fail = '') {
    const tables = { vehicles: [], vehicle_images: [], equipment_catalog: [], vehicle_equipment: [] };
    let sequence = 0;
    const client = {
        from(table) {
            let action = 'select', values, options = {}, filters = [], single = false;
            const query = {
                select() { return query; },
                order() { return query; },
                single() { single = true; return query; },
                upsert(data, config = {}) { action = 'upsert'; values = data; options = config; return query; },
                insert(data) { action = 'insert'; values = data; return query; },
                delete() { action = 'delete'; return query; },
                eq(key, value) { filters.push(row => row[key] === value); return query; },
                in(key, value) { filters.push(row => value.includes(row[key])); return query; },
                then(resolve, reject) {
                    return Promise.resolve().then(() => {
                        if (fail === `${table}:${action}`) return { data: null, error: { message: 'Simulated failure' } };
                        let data;
                        if (action === 'delete') {
                            tables[table] = tables[table].filter(row => !filters.every(filter => filter(row)));
                            data = [];
                        } else if (action === 'select') {
                            data = tables[table].filter(row => filters.every(filter => filter(row)));
                            if (table === 'vehicles') data = data.map(row => ({
                                ...row,
                                vehicle_images: tables.vehicle_images.filter(image => image.vehicle_id === row.id),
                                vehicle_equipment: tables.vehicle_equipment.filter(link => link.vehicle_id === row.id).map(link => ({
                                    equipment_catalog: tables.equipment_catalog.find(item => item.id === link.equipment_id)
                                }))
                            }));
                        } else {
                            data = (Array.isArray(values) ? values : [values]).map(input => {
                                const keys = (options.onConflict || (table === 'vehicle_equipment' ? 'vehicle_id,equipment_id' : 'id')).split(',');
                                const existing = tables[table].find(row => keys.every(key => input[key] !== undefined && row[key] === input[key]));
                                if (existing && action === 'upsert') {
                                    if (!options.ignoreDuplicates) Object.assign(existing, input);
                                    return existing;
                                }
                                const row = { id: `test-uuid-${++sequence}`, ...input };
                                tables[table].push(row);
                                return row;
                            });
                        }
                        return { data: single ? data[0] : data, error: null };
                    }).then(resolve, reject);
                }
            };
            return query;
        }
    };
    const context = { window: { jasgSupabase: client } };
    vm.runInNewContext(read('supabase-data.js'), context, { filename: 'supabase-data.js' });
    return { db: context.window.jasgDb, tables };
}

function gallery(page = 'admin.html') {
    let timer = null;
    const watches = {};
    const context = {
        window: { matchMedia: () => ({ matches: true }) },
        document: { hidden: false, activeElement: null, querySelector: () => null },
        setInterval(callback) { timer = callback; return 1; }, clearInterval() { timer = null; }, console, Date
    };
    vm.createContext(context);
    vm.runInContext(read('vehicle-gallery.js'), context, { filename: 'vehicle-gallery.js' });
    vm.runInContext(read('site-branding.js'), context, { filename: 'site-branding.js' });
    for (const script of read(page).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        if (script[1].includes('function automotoraApp')) vm.runInContext(script[1], context);
    }
    const app = context.automotoraApp();
    app.$refs = {};
    app.$nextTick = fn => fn();
    app.$watch = (key, callback) => { watches[key] = callback; };
    app.tickSlideshow = () => timer?.();
    app.notifyDetailClosed = () => watches.detailModalOpen(false);
    app.selectedVehicle = { id: 'gallery-car', images: ['first.jpg', 'second.jpg', 'third.jpg'] };
    app.activeDetailImage = 'first.jpg';
    app.detailModalOpen = true;
    return app;
}

const vehicle = { id: 'new-car-uuid', brand: 'Test', model: 'Test', year: 2026, images: ['https://example.com/car.jpg'], features: ['Apple CarPlay', 'Sunroof'] };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('new publication retains equipment after database reload', async () => {
    const { db } = database();
    assert.equal((await db.saveVehicle(vehicle, 'user')).error, null);
    const result = await db.listVehicles();
    assert.deepEqual(plain(result.data[0].features).sort(), [...vehicle.features].sort());
});

test('editing equipment removes deselected items, without affecting another car', async () => {
    const { db } = database();
    await db.saveVehicle(vehicle, 'user');
    await db.saveVehicle({ ...vehicle, id: 'other-car-uuid' }, 'user');
    await db.saveVehicle({ ...vehicle, features: ['Sunroof', 'Cámara'] }, 'user');
    const { data } = await db.listVehicles();
    assert.deepEqual(plain(data.find(row => row.id === vehicle.id).features).sort(), ['Cámara', 'Sunroof']);
    assert.deepEqual(plain(data.find(row => row.id === 'other-car-uuid').features).sort(), [...vehicle.features].sort());
});

test('empty equipment clears links but retains shared catalog entries', async () => {
    const { db, tables } = database();
    await db.saveVehicle(vehicle, 'user');
    await db.saveVehicle({ ...vehicle, features: [] }, 'user');
    assert.equal(tables.vehicle_equipment.length, 0);
    assert.equal(tables.equipment_catalog.length, 2);
});

test('repeated saves normalize equipment and do not duplicate it', async () => {
    const { db, tables } = database();
    const input = { ...vehicle, features: [' Sunroof ', 'Sunroof', '', '  '] };
    await db.saveVehicle(input, 'user');
    await db.saveVehicle(input, 'user');
    assert.equal(tables.vehicles.length, 1);
    assert.equal(tables.vehicle_equipment.length, 1);
    assert.equal(tables.equipment_catalog.length, 1);
});

test('equipment persistence failures are reported instead of claiming success', async () => {
    const { db } = database('vehicle_equipment:upsert');
    assert.ok((await db.saveVehicle(vehicle, 'user')).error);
});

for (const failure of ['equipment_catalog:upsert', 'equipment_catalog:select', 'vehicle_equipment:select', 'vehicles:upsert', 'vehicle_images:delete', 'vehicle_images:insert']) {
    test(`database failure is surfaced: ${failure}`, async () => {
        const { db } = database(failure);
        assert.ok((await db.saveVehicle(vehicle, 'user')).error);
    });
}

test('failed equipment removal preserves existing links', async () => {
    const { db, tables } = database('vehicle_equipment:delete');
    await db.saveVehicle(vehicle, 'user');
    const result = await db.saveVehicle({ ...vehicle, features: [] }, 'user');
    assert.ok(result.error);
    assert.equal(tables.vehicle_equipment.length, 2);
});

for (const page of ['index.html', 'admin.html']) {
    test(`${page}: clicking or tapping the card photo opens the same detail`, () => {
        const app = gallery(page);
        const car = app.selectedVehicle;
        app.detailModalOpen = false;
        app.openCardDetail(car);
        assert.equal(app.detailModalOpen, true);
        assert.equal(app.selectedVehicle, car);
        app.detailModalOpen = false;
        app.startCardSwipe(car, { changedTouches: [{ clientX: 100, clientY: 100 }] });
        app.endCardSwipe(car, { changedTouches: [{ clientX: 102, clientY: 102 }] });
        app.openCardDetail(car);
        assert.equal(app.detailModalOpen, true);
    });
    test(`${page}: swiping photos does not open details`, () => {
        const app = gallery(page), car = app.selectedVehicle;
        app.detailModalOpen = false;
        app.startCardSwipe(car, { changedTouches: [{ clientX: 200, clientY: 100 }] });
        app.endCardSwipe(car, { changedTouches: [{ clientX: 50, clientY: 100 }] });
        app.openCardDetail(car);
        assert.equal(app.detailModalOpen, false);
        assert.equal(app.getCardIndex(car), 1);
    });
    test(`${page}: vertical scrolling and cancelled touches do not open details`, () => {
        const app = gallery(page), car = app.selectedVehicle;
        app.detailModalOpen = false;
        app.startCardSwipe(car, { changedTouches: [{ clientX: 100, clientY: 100 }] });
        app.endCardSwipe(car, { changedTouches: [{ clientX: 145, clientY: 240 }] });
        app.openCardDetail(car);
        assert.equal(app.detailModalOpen, false);
        assert.equal(app.getCardIndex(car), 0);
        app.startCardSwipe(car, { changedTouches: [{ clientX: 100, clientY: 100 }] });
        app.cancelCardSwipe(car);
        app.openCardDetail(car);
        assert.equal(app.detailModalOpen, false);
    });
    test(`${page}: photo and overlays have a keyboard-accessible detail action`, () => {
        const container = read(page).split('<!-- Image Container -->')[1].split('<img')[0];
        assert.match(container, /role="button"/);
        assert.match(container, /tabindex="0"/);
        assert.match(container, /@click="openCardDetail\(vehicle\)"/);
        assert.match(container, /@keydown\.enter\.prevent="openDetailModal\(vehicle\)"/);
        assert.match(container, /@keydown\.space\.prevent="openDetailModal\(vehicle\)"/);
    });
    test(`${page}: fullscreen plus and navigation clicks keep both dialogs open`, () => {
        const app = gallery(page);
        app.initGallery();
        app.openZoom();
        app.zoomIn();
        dispatchModalClick(page, app, 'zoom-control');
        assert.equal(app.detailModalOpen, true);
        assert.equal(app.zoomOpen, true);
        assert.equal(app.zoomScale, 1.25);
        app.changeZoomImage(1);
        dispatchModalClick(page, app, 'zoom-control');
        assert.equal(app.detailModalOpen, true);
        assert.equal(app.zoomOpen, true);
        assert.equal(app.activeDetailImage, 'second.jpg');
        app.closeZoom();
        dispatchModalClick(page, app, 'zoom-close');
        assert.equal(app.detailModalOpen, true);
        assert.equal(app.zoomOpen, false);
        dispatchModalClick(page, app, 'detail-content');
        assert.equal(app.detailModalOpen, true);
        dispatchModalClick(page, app, 'detail-backdrop');
        assert.equal(app.detailModalOpen, false);
    });
    test(`${page}: larger magnifier keeps its center over the cursor`, () => {
        const app = gallery(page);
        const image = { naturalWidth: 200, naturalHeight: 400, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }) };
        app.moveDetailMagnifier({ currentTarget: image, clientX: 400, clientY: 200 });
        const style = app.detailMagnifierStyle();
        assert.equal(style.width, '200px');
        assert.equal(style.height, '200px');
        assert.equal(style.left, '300px');
        assert.equal(style.top, '100px');
        assert.equal(style.backgroundPosition, '-150px -400px');
    });
    test(`${page}: catalog does not activate a magnifier`, () => {
        const cards = read(page).split('<!-- Vehicles Cards Grid -->')[1].split('<!--')[0];
        // Check the entire card image block up to the sold overlay.
        const block = read(page).split('<!-- Image Container -->')[1].split('<!-- Sold overlay')[0];
        assert.ok(cards);
        assert.doesNotMatch(block, /magnifier|Magnifier/);
    });
    test(`${page}: fullscreen navigation wraps and resets zoom`, () => {
        const app = gallery(page);
        app.openZoom();
        app.zoomIn();
        app.changeZoomImage(-1);
        assert.equal(app.activeDetailImage, 'third.jpg');
        assert.equal(app.zoomPhotoNumber(), 3);
        assert.equal(app.zoomScale, 1);
        app.changeZoomImage(1);
        assert.equal(app.activeDetailImage, 'first.jpg');
    });
    test(`${page}: keyboard navigation and escape keep details open`, () => {
        const app = gallery(page);
        app.openZoom();
        app.handleZoomKeydown({ key: 'ArrowRight', preventDefault() {} });
        assert.equal(app.activeDetailImage, 'second.jpg');
        app.handleZoomKeydown({ key: 'Escape', preventDefault() {} });
        assert.equal(app.zoomOpen, false);
        assert.equal(app.detailModalOpen, true);
    });
    test(`${page}: touch swipe navigates photos; vertical swipe does not`, () => {
        const app = gallery(page);
        app.openZoom();
        const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });
        app.beginZoomSwipe(touch(250, 150));
        app.finishZoomSwipe(touch(70, 155));
        assert.equal(app.activeDetailImage, 'second.jpg');
        app.beginZoomSwipe(touch(250, 150));
        app.finishZoomSwipe(touch(245, 300));
        assert.equal(app.activeDetailImage, 'second.jpg');
    });
    test(`${page}: single-photo navigation is safe`, () => {
        const app = gallery(page);
        app.selectedVehicle.images = ['first.jpg'];
        app.openZoom();
        app.changeZoomImage(1);
        assert.equal(app.activeDetailImage, 'first.jpg');
        assert.equal(app.zoomPhotoCount(), 1);
    });
    test(`${page}: zoom is bounded, reset on closing and restores focus`, () => {
        const app = gallery(page);
        let focused = false;
        app.openZoom();
        app.zoomReturnFocus = { focus() { focused = true; } };
        for (let i = 0; i < 20; i++) app.handleZoomWheel({ deltaY: -1 });
        assert.equal(app.zoomScale, 3);
        for (let i = 0; i < 20; i++) app.handleZoomWheel({ deltaY: 1 });
        assert.equal(app.zoomScale, 1);
        app.zoomIn();
        app.closeZoom();
        assert.equal(app.zoomScale, 1);
        assert.equal(focused, true);
        app.handleZoomKeydown({ key: 'ArrowRight', preventDefault() {} });
        assert.equal(app.activeDetailImage, 'first.jpg');
    });
    test(`${page}: detail swipe does not accidentally open fullscreen`, () => {
        const app = gallery(page);
        app.beginGallerySwipe({ changedTouches: [{ clientX: 240, clientY: 100 }] });
        app.finishGallerySwipe({ changedTouches: [{ clientX: 80, clientY: 105 }] });
        assert.equal(app.activeDetailImage, 'second.jpg');
        app.openZoom();
        assert.equal(app.zoomOpen, false);
    });
    test(`${page}: magnifier follows the contained photo and hides in its margins`, () => {
        const app = gallery(page);
        app.activateDetailMagnifier();
        const image = { naturalWidth: 200, naturalHeight: 400, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }) };
        app.moveDetailMagnifier({ currentTarget: image, clientX: 400, clientY: 200 });
        assert.equal(app.detailMagnifier.active, true);
        assert.equal(app.detailMagnifierStyle().backgroundSize, '500px 1000px');
        app.moveDetailMagnifier({ currentTarget: image, clientX: 100, clientY: 200 });
        assert.equal(app.detailMagnifier.active, false);
        app.deactivateDetailMagnifier();
    });
    test(`${page}: slideshow pauses in fullscreen and closing detail stops it`, () => {
        const app = gallery(page);
        app.initGallery();
        app.toggleDetailSlideshow();
        app.tickSlideshow();
        assert.equal(app.activeDetailImage, 'second.jpg');
        app.openZoom();
        app.tickSlideshow();
        assert.equal(app.activeDetailImage, 'second.jpg');
        app.closeZoom();
        app.tickSlideshow();
        assert.equal(app.activeDetailImage, 'third.jpg');
        app.notifyDetailClosed();
        assert.equal(app.detailSlideshowPlaying, false);
        app.destroy();
    });
}

test('admin first submission includes selected and typed equipment and retains it after reload', async () => {
    const { db } = database();
    const context = {
        window: { jasgDb: db, jasgSupabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'user' } } } }) } } },
        crypto: { randomUUID: () => 'new-admin-uuid' }, localStorage: { setItem() {} },
        alert(message) { throw new Error(message); }, console, Date, setInterval, clearInterval
    };
    vm.createContext(context);
    vm.runInContext(read('vehicle-gallery.js'), context);
    vm.runInContext(read('site-branding.js'), context);
    const source = [...read('admin.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('function automotoraApp'))[1];
    vm.runInContext(source, context);
    const app = context.automotoraApp();
    app.openCreateForm();
    Object.assign(app.formData, vehicle, { id: 123, uploadedImages: vehicle.images, selectedFeatures: ['Sunroof'] });
    app.newEquipment = 'Cámara personalizada';
    await app.saveVehicle();
    assert.equal(app.formModalOpen, false);
    assert.equal(app.vehicles.length, 1);
    assert.deepEqual(plain((await db.listVehicles()).data[0].features).sort(), ['Cámara personalizada', 'Sunroof']);
});

module.exports = async function run() {
    const results = [];
    for (const { name, fn } of tests) {
        try { await fn(); results.push({ name, pass: true }); }
        catch (error) { results.push({ name, pass: false, error: error.message }); }
    }
    return results;
};
if (require.main === module) module.exports().then(results => {
    for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`);
    process.exitCode = results.some(result => !result.pass) ? 1 : 0;
});
