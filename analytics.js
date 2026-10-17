(() => {
    'use strict';
    const page = location.pathname.startsWith('/enlaces') ? 'links' : 'catalog';
    if (!['/', '/index.html', '/enlaces', '/enlaces/', '/enlaces/index.html'].includes(location.pathname)) return;
    let memorySession;
    let disabled = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    const ready = (async () => {
        try { if ((await window.jasgSupabase?.auth.getSession())?.data?.session) disabled = true; }
        catch { disabled = true; }
    })();
    function source() {
        let hostname = '';
        try { hostname = new URL(document.referrer).hostname; } catch { /* Direct visit. */ }
        if (!hostname || hostname === location.hostname) return 'direct';
        for (const [name, pattern] of [['instagram', /(^|\.)instagram\.com$/], ['facebook', /(^|\.)(facebook\.com|fb\.com)$/], ['google', /(^|\.)google\.[a-z.]+$/], ['bing', /(^|\.)bing\.com$/]]) {
            if (pattern.test(hostname)) return name;
        }
        return 'other';
    }
    function session() {
        let saved = memorySession;
        try { saved = JSON.parse(sessionStorage.getItem('jasg-analytics-session')) || saved; } catch { /* Private browsing fallback. */ }
        if (!saved || Date.now() - saved.last > 1800000) saved = { id: crypto.randomUUID(), source: source() };
        saved.last = Date.now(); memorySession = saved;
        try { sessionStorage.setItem('jasg-analytics-session', JSON.stringify(saved)); } catch { /* Memory-only session. */ }
        return saved;
    }
    async function track(type, extras = {}) {
        try {
            await ready;
            if (disabled || !crypto.randomUUID) return;
            const current = session();
            const device = /iPad|Tablet/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'tablet' : /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
            await fetch('/api/analytics/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
                body: JSON.stringify({ id: crypto.randomUUID(), session: current.id, type, page, source: current.source, device, ...extras }) });
        } catch { /* Measurement must never interrupt catalogue navigation. */ }
    }
    window.jasgAnalytics = { track };
    document.addEventListener('DOMContentLoaded', () => {
        void track('page_view');
        if (page === 'links') document.querySelectorAll('a[href]').forEach(link => {
            const url = new URL(link.href, location.href);
            const target = url.hostname === 'wa.me' ? 'whatsapp' : url.protocol === 'tel:' ? 'phone' : url.hostname === location.hostname ? 'site' : url.hostname.endsWith('.instagram.com') ? 'instagram' : url.hostname.endsWith('.facebook.com') ? 'facebook' : null;
            if (target) link.addEventListener('click', () => void track(target === 'whatsapp' ? 'whatsapp_click' : 'link_click', { target }));
        });
    });
})();
