(() => {
    'use strict';
    const labels = { direct: 'Directo / sin referencia', instagram: 'Instagram', facebook: 'Facebook', google: 'Google', bing: 'Bing', other: 'Otros sitios', mobile: 'Celular', tablet: 'Tablet', desktop: 'Escritorio', site: 'Catálogo', phone: 'Teléfono', whatsapp: 'WhatsApp' };
    window.jasgAnalyticsDashboard = () => ({
        analytics: null, analyticsDays: '30', analyticsLoading: false, analyticsError: '',
        diagnostic: null, diagnosticLoading: false, diagnosticError: '', vehicleSort: 'views',
        async diagnoseCountry() {
            if (this.diagnosticLoading) return;
            this.diagnosticLoading = true; this.diagnosticError = ''; this.diagnostic = null;
            try {
                const session = (await window.jasgSupabase.auth.getSession()).data.session;
                if (!session) throw new Error('Vuelve a iniciar sesión para comprobar tu conexión.');
                const response = await fetch('/api/analytics/stats?diagnostic=1', {headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
                if (!response.ok) throw new Error('No se pudo comprobar tu conexión. Intenta nuevamente.');
                this.diagnostic = await response.json();
            } catch (error) { this.diagnosticError = error.message; }
            finally { this.diagnosticLoading = false; }
        },
        countryName(code) { try { return !code || code === 'ZZ' ? 'País no disponible' : new Intl.DisplayNames(['es'], {type:'region'}).of(code); } catch { return 'País no disponible'; } },
        comparison(key) {
            if (!this.analytics?.previous || !this.analytics.previousCovered) return 'Historial anterior insuficiente';
            const current = this.analytics[key] || 0, previous = this.analytics.previous[key] || 0;
            if (!previous) return current ? 'Sin base anterior para calcular %' : 'Sin variación';
            const value = (current - previous) / previous * 100;
            return `${value > 0 ? '+' : ''}${value.toFixed(1)}% vs. período anterior`;
        },
        contactRate() { return this.analytics?.measuredSessions ? `${(100 * this.analytics.contactSessions / this.analytics.measuredSessions).toFixed(1)}%` : 'Sin datos'; },
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
                if (group === 'campaigns') label = key === 'c_none' ? 'Sin campaña etiquetada' : key.replace(/^c_/, '');
                const total = Object.values(this.analytics?.[group] || {}).reduce((sum, value) => sum + value, 0);
                return { key, label, count, percent: total ? (100 * count / total).toFixed(1) : '0.0' };
            });
        },
        get analyticsVehicles() {
            return Object.entries(this.analytics?.vehicles || {}).map(([id, counts]) => {
                const vehicle = this.vehicles?.find(item => item.id === id);
                return { id, label: vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.year})` : `Vehículo no disponible (${id.slice(0, 8)})`, ...counts };
            }).sort((a, b) => this.vehicleSort === 'whatsapp' ? b.whatsapp - a.whatsapp || b.views - a.views : b.views - a.views || b.whatsapp - a.whatsapp).slice(0, 20);
        },
        analyticsBar(visits) { return `${Math.max(0, visits / Math.max(1, ...(this.analytics?.daily || []).map(day => day.visits)) * 100)}%`; },
        analyticsDate(value) { return value ? new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'Sin visitas registradas todavía'; }
    });
})();
