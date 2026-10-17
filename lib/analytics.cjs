const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const counters = ['visits', 'pageViews', 'vehicleClicks', 'whatsappClicks'];
const maps = ['countries', 'sources', 'devices', 'pages', 'links'];
const dayKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
function normalizeEvent(body, context, now = new Date()) {
    if (!body || !UUID.test(body.id) || !UUID.test(body.session) ||
        !['page_view', 'vehicle_view', 'whatsapp_click', 'link_click'].includes(body.type) ||
        !['catalog', 'links'].includes(body.page) ||
        !['direct', 'instagram', 'facebook', 'google', 'bing', 'other'].includes(body.source) ||
        !['mobile', 'tablet', 'desktop'].includes(body.device) ||
        (body.type === 'vehicle_view' && !UUID.test(body.vehicleId)) ||
        (body.vehicleId != null && !UUID.test(body.vehicleId)) ||
        (body.type === 'link_click' && !['instagram', 'facebook', 'site', 'phone', 'whatsapp'].includes(body.target))) throw new Error('Invalid event');
    const country = context.geo?.country?.code;
    return { id: body.id.toLowerCase(), session: body.session.toLowerCase(), type: body.type, page: body.page,
        source: body.source, device: body.device, country: /^[A-Z]{2}$/.test(country) ? country : 'ZZ',
        day: dayKey(now), time: now.toISOString(), ...(body.vehicleId ? { vehicleId: body.vehicleId.toLowerCase() } : {}),
        ...(body.type === 'link_click' ? { target: body.target } : {}) };
}
function empty() {
    return { visits: 0, pageViews: 0, vehicleClicks: 0, whatsappClicks: 0, countries: {}, sources: {}, devices: {}, pages: {}, links: {}, vehicles: {} };
}
const increment = (map, key, amount = 1) => { map[key] = (map[key] || 0) + amount; };
async function recordEvent(store, event) {
    const key = `daily/${event.day}/${parseInt(event.session.slice(0, 8), 16) % 8}`;
    for (let attempt = 0; attempt < 8; attempt++) {
        const existing = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
        const data = existing?.data || { ...empty(), seen: {}, sessions: {} };
        if (data.seen[event.id]) return;
        if (Object.keys(data.seen).length >= 5000) throw new Error('Daily capacity reached');
        data.seen[event.id] = true;
        if (!data.sessions[event.session]) {
            data.sessions[event.session] = true;
            data.visits++;
            increment(data.countries, event.country);
            increment(data.sources, event.source);
            increment(data.devices, event.device);
        }
        if (event.type === 'page_view') { data.pageViews++; increment(data.pages, event.page); }
        if (event.type === 'vehicle_view') data.vehicleClicks++;
        if (event.type === 'whatsapp_click') data.whatsappClicks++;
        if (event.type === 'link_click') increment(data.links, event.target);
        if (event.vehicleId && ['vehicle_view', 'whatsapp_click'].includes(event.type)) {
            data.vehicles[event.vehicleId] ||= { views: 0, whatsapp: 0 };
            data.vehicles[event.vehicleId][event.type === 'vehicle_view' ? 'views' : 'whatsapp']++;
        }
        const result = await store.setJSON(key, data, existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true });
        if (result.modified) {
            await store.setJSON('meta', { startedAt: event.time }, { onlyIfNew: true });
            return;
        }
    }
    throw new Error('Concurrent update conflict');
}
async function readStats(store, days, now = new Date()) {
    if (![1, 7, 30, 90].includes(days)) throw new Error('Invalid period');
    const stats = { ...empty(), daily: [], startedAt: (await store.get('meta', { type: 'json', consistency: 'strong' }))?.startedAt || null, updatedAt: now.toISOString() };
    const today = new Date(`${dayKey(now)}T12:00:00Z`);
    for (let offset = days - 1; offset >= 0; offset--) {
        const day = new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);
        const shards = await Promise.all(Array.from({ length: 8 }, (_, i) => store.get(`daily/${day}/${i}`, { type: 'json', consistency: 'strong' })));
        let visits = 0;
        for (const data of shards.filter(Boolean)) {
            visits += data.visits;
            for (const key of counters) stats[key] += data[key];
            for (const key of maps) for (const [name, count] of Object.entries(data[key])) increment(stats[key], name, count);
            for (const [id, counts] of Object.entries(data.vehicles)) {
                stats.vehicles[id] ||= { views: 0, whatsapp: 0 };
                stats.vehicles[id].views += counts.views;
                stats.vehicles[id].whatsapp += counts.whatsapp;
            }
        }
        stats.daily.push({ day, visits });
    }
    return stats;
}
module.exports = { normalizeEvent, recordEvent, readStats, dayKey };
