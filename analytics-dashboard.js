(() => {
    'use strict';
    const labels = { direct: 'Directo / sin referencia', instagram: 'Instagram', facebook: 'Facebook', google: 'Google', bing: 'Bing', other: 'Otros sitios', mobile: 'Celular', tablet: 'Tablet', desktop: 'Escritorio', site: 'Catálogo', phone: 'Teléfono', whatsapp: 'WhatsApp' };
    window.jasgAnalyticsDashboard = () => ({
        analytics: null, analyticsDays: '30', analyticsLoading: false, analyticsError: '',
        async loadAnalytics() {
            if (this.analyticsLoading) return;
            this.analyticsLoading = true; this.analyticsError = ''; this.analytics = null;
            try {
                const session = (await window.jasgSupabase.auth.getSession()).data.session;
                if (!session) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
                const response = await fetch(`/api/analytics/stats?days=${this.analyticsDays}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: AbortSignal.timeout(45000) });
                if (!response.ok) throw new Error(response.status === 401 ? 'Tu sesión venció. Vuelve a iniciar sesión.' : 'No se pudieron cargar las estadísticas. Intenta actualizar en unos momentos.');
                this.analytics = await response.json();
            } catch (error) { this.analyticsError = error.message || 'No se pudieron cargar las estadísticas.'; }
            finally { this.analyticsLoading = false; }
        },
        analyticsRows(group) {
            return Object.entries(this.analytics?.[group] || {}).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
                let label = labels[key] || key;
                if (group === 'countries') {
                    try { label = key === 'ZZ' ? 'País no disponible' : new Intl.DisplayNames(['es'], { type: 'region' }).of(key); } catch { label = key; }
                }
                return { key, label, count };
            });
        },
        get analyticsVehicles() {
            return Object.entries(this.analytics?.vehicles || {}).map(([id, counts]) => {
                const vehicle = this.vehicles?.find(item => item.id === id);
                return { id, label: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.year})` : `Vehículo no disponible (${id.slice(0, 8)})`, ...counts };
            }).sort((a, b) => b.views - a.views || b.whatsapp - a.whatsapp).slice(0, 20);
        },
        analyticsBar(visits) { return `${Math.max(0, visits / Math.max(1, ...(this.analytics?.daily || []).map(day => day.visits)) * 100)}%`; },
        analyticsDate(value) { return value ? new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'Sin visitas registradas todavía'; }
    });
})();
