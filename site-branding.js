(function () {
    const DEFAULT_LOGO = 'assets/jasg-logo.jpeg';
    const LOGO_PATH = 'branding/site-logo.png';
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

    function logoBucket() {
        if (!window.jasgSupabase) throw new Error('No se pudo conectar con el servidor.');
        return window.jasgSupabase.storage.from('vehicle-images');
    }

    function sharedLogoUrl() {
        const url = new URL(logoBucket().getPublicUrl(LOGO_PATH).data.publicUrl);
        // Una URL nueva evita mostrar una versión anterior desde la caché del CDN.
        url.searchParams.set('v', crypto.randomUUID());
        return url.href;
    }

    async function validateFile(file) {
        if (!file || !ALLOWED_TYPES.includes(file.type)) throw new Error('Selecciona una imagen PNG, JPG o WebP.');
        if (!file.size || file.size > MAX_FILE_SIZE) throw new Error('La imagen debe pesar como máximo 5 MB y no estar vacía.');
        const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const matches = (offset, signature) => signature.every((value, index) => bytes[offset + index] === value);
        const valid = (file.type === 'image/png' && matches(0, [137, 80, 78, 71, 13, 10, 26, 10])) ||
            (file.type === 'image/jpeg' && matches(0, [255, 216, 255])) ||
            (file.type === 'image/webp' && matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80]));
        if (!valid) throw new Error('El archivo no contiene una imagen válida del formato indicado.');
    }

    window.jasgLogoStore = {
        async load() {
            const url = sharedLogoUrl();
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                if (response.status === 404 || String(error.statusCode) === '404' || error.code === 'NoSuchKey') return DEFAULT_LOGO;
                throw new Error('No se pudo cargar el logo guardado.');
            }
            if (!response.headers.get('Content-Type')?.startsWith('image/')) throw new Error('El logo guardado no es una imagen válida.');
            return url;
        },

        async prepare(file) {
            await validateFile(file);
            const objectUrl = URL.createObjectURL(file);
            try {
                const image = await new Promise((resolve, reject) => {
                    const element = new Image();
                    element.onload = () => resolve(element);
                    element.onerror = () => reject(new Error('No se pudo abrir la imagen. Selecciona otro archivo.'));
                    element.src = objectUrl;
                });
                if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) {
                    throw new Error('La resolución de la imagen es demasiado grande. Usa una imagen de hasta 40 megapíxeles.');
                }
                const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if (!blob || blob.size > MAX_FILE_SIZE) throw new Error('No se pudo preparar la imagen. Prueba con un archivo más pequeño.');
                return blob;
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        },

        async save(blob) {
            await validateFile(blob);
            if (blob.type !== 'image/png') throw new Error('Primero selecciona y prepara la imagen del logo.');
            const client = window.jasgSupabase;
            const user = await client?.auth.getUser();
            if (user?.error || !user?.data?.user) throw new Error('Tu sesión expiró. Ingresa nuevamente al panel.');
            const uploaded = await logoBucket().upload(LOGO_PATH, blob, { contentType: 'image/png', cacheControl: '0', upsert: true });
            if (uploaded.error) throw new Error('No se pudo guardar el logo. Comprueba tu conexión y vuelve a intentarlo.');
            return sharedLogoUrl();
        }
    };

    window.jasgBranding = function () {
        return {
            siteLogoUrl: DEFAULT_LOGO,
            logoManagerOpen: false,
            logoLoading: false,
            logoPreparing: false,
            logoSaving: false,
            logoDraftUrl: '',
            logoDraftFile: null,
            logoDraftName: '',
            logoError: '',
            logoMessage: '',

            async initBranding() {
                this.logoLoading = true;
                try { this.siteLogoUrl = await window.jasgLogoStore.load(); }
                catch (_) { this.logoError = 'No se pudo cargar el logo guardado. Se muestra el logo original; puedes volver a cargar la página.'; }
                finally { this.logoLoading = false; }
            },

            useLogoFallback() { this.siteLogoUrl = DEFAULT_LOGO; },

            releaseLogoDraft() {
                if (this.logoDraftUrl) URL.revokeObjectURL(this.logoDraftUrl);
                this.logoDraftUrl = '';
                this.logoDraftFile = null;
                this.logoDraftName = '';
            },

            cancelLogoDraft() {
                if (this.logoPreparing || this.logoSaving) return;
                this.releaseLogoDraft();
                this.logoError = '';
                this.logoMessage = '';
            },

            async prepareLogoDraft(file, name) {
                const prepared = await window.jasgLogoStore.prepare(file);
                this.releaseLogoDraft();
                this.logoDraftFile = prepared;
                this.logoDraftUrl = URL.createObjectURL(prepared);
                this.logoDraftName = name;
            },

            async selectLogoFile(event) {
                if (this.logoPreparing || this.logoSaving) return;
                const file = event.target.files?.[0];
                if (!file) return;
                this.logoPreparing = true;
                this.logoError = '';
                this.logoMessage = '';
                try { await this.prepareLogoDraft(file, file.name || 'Nuevo logo'); }
                catch (error) { this.logoError = error.message || 'No se pudo preparar el logo.'; }
                finally { this.logoPreparing = false; event.target.value = ''; }
            },

            async useOriginalLogo() {
                if (this.logoPreparing || this.logoSaving) return;
                this.logoPreparing = true;
                this.logoError = '';
                this.logoMessage = '';
                try {
                    const response = await fetch(DEFAULT_LOGO);
                    if (!response.ok) throw new Error('No se pudo cargar el logo original.');
                    await this.prepareLogoDraft(await response.blob(), 'Logo original');
                } catch (_) { this.logoError = 'No se pudo cargar el logo original. Vuelve a intentarlo.'; }
                finally { this.logoPreparing = false; }
            },

            async saveLogo() {
                if (!this.logoDraftFile || this.logoLoading || this.logoPreparing || this.logoSaving) return;
                this.logoSaving = true;
                this.logoError = '';
                this.logoMessage = '';
                try {
                    this.siteLogoUrl = await window.jasgLogoStore.save(this.logoDraftFile);
                    this.releaseLogoDraft();
                    this.logoMessage = 'Logo guardado. Ya está disponible en la página pública y en el panel.';
                } catch (error) { this.logoError = error.message || 'No se pudo guardar el logo. Vuelve a intentarlo.'; }
                finally { this.logoSaving = false; }
            }
        };
    };
})();
