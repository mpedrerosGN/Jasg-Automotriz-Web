const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

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
    vm.runInNewContext(read('supabase-data.js'), context);
    return { db: context.window.jasgDb, tables };
}

function gallery(page = 'admin.html') {
    const context = {
        window: { matchMedia: () => ({ matches: true }) },
        document: { hidden: false, activeElement: null, querySelector: () => null },
        setInterval: () => 1, clearInterval() {}, console, Date
    };
    vm.createContext(context);
    vm.runInContext(read('vehicle-gallery.js'), context);
    for (const script of read(page).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        if (script[1].includes('function automotoraApp')) vm.runInContext(script[1], context);
    }
    const app = context.automotoraApp();
    app.$refs = {};
    app.$nextTick = fn => fn();
    app.$watch = () => {};
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

for (const page of ['index.html', 'admin.html']) {
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
        assert.equal(app.zoomPhotoCount, 1);
    });
}

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
