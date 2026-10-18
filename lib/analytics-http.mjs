import core from './analytics.cjs';
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };
const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
// Public project identifier and publishable key, identical to the browser configuration.
const authUrl = 'https://xxgqizzuxcvudcpxledg.supabase.co/auth/v1/user';
const apiKey = 'sb_publishable_yRq_ChKj9E3Fh1wjXd5RkA_aExzGOpR';
export async function collect(request, context, getStore) {
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply(403, { error: 'Origin not allowed' });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { error: 'JSON required' });
    if (context.deploy?.context !== 'production' || context.deploy?.published !== true || /bot|crawler|spider|headless|lighthouse|pagespeed|curl|wget|python|httpclient|monitor|preview/i.test(request.headers.get('user-agent') || '') || request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') return reply(202, { ignored: true });
    let event;
    try {
        const body = await request.text();
        if (body.length > 2048) return reply(413, { error: 'Too large' });
        event = core.normalizeEvent(JSON.parse(body), context);
    } catch { return reply(400, { error: 'Invalid event' }); }
    try { await core.recordEvent(getStore(), event); return reply(200, { recorded: true }); }
    catch { return reply(503, { error: 'Measurement temporarily unavailable' }); }
}
export async function stats(request, getStore, fetchUser = fetch, context = {}) {
    if (request.method !== 'GET') return reply(405, { error: 'Method not allowed' });
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) return reply(401, { error: 'Authentication required' });
    try {
        const user = await fetchUser(authUrl, { headers: { authorization, apikey: apiKey }, signal: AbortSignal.timeout(8000) });
        if (!user.ok || !(await user.json()).id) return reply(401, { error: 'Invalid session' });
        if (new URL(request.url).searchParams.get('diagnostic') === '1') {
            const country = context.geo?.country?.code;
            return reply(200, { country: /^[A-Z]{2}$/.test(country) ? country : 'ZZ', source: 'Netlify geo', approximate: true, counted: false, checkedAt: new Date().toISOString() });
        }
        // This project grants catalogue administration to all authenticated users.
        const days = Number(new URL(request.url).searchParams.get('days') || 30);
        if (![1, 7, 30, 90].includes(days)) return reply(400, { error: 'Invalid period' });
        return reply(200, await core.readReport(getStore(), days));
    } catch { return reply(503, { error: 'Statistics temporarily unavailable' }); }
}
