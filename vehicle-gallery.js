(function () {
    window.jasgGallery = function () {
        let timer = null;
        return {
            detailSlideshowPlaying: false,
            detailGalleryHovered: false,
            detailSwipeOrigin: null,
            imageUploadBusy: false,
            vehicleSaving: false,
            zoomScale: 1,
            zoomSwipeOrigin: null,
            zoomReturnFocus: null,
            suppressZoomUntil: 0,
            cardDetailBlockedUntil: {},
            detailMagnifier: { active: false, x: 0, y: 0, width: 0, height: 0 },

            openCardDetail(vehicle) {
                if (Date.now() < (this.cardDetailBlockedUntil[vehicle.id] || 0)) return;
                this.openDetailModal(vehicle);
            },

            startCardSwipe(vehicle, event) {
                const touch = event.changedTouches[0];
                this.cardSwipeStarts[vehicle.id] = { x: touch.clientX, y: touch.clientY };
                this.cardDetailBlockedUntil[vehicle.id] = 0;
                if (event.touches && event.touches.length !== 1) this.cancelCardSwipe(vehicle);
            },

            endCardSwipe(vehicle, event) {
                const start = this.cardSwipeStarts[vehicle.id];
                if (!start) return;
                delete this.cardSwipeStarts[vehicle.id];
                const touch = event.changedTouches[0];
                const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    this.cardDetailBlockedUntil[vehicle.id] = Date.now() + 700;
                }
                const images = this.getVehicleImages(vehicle);
                if (images.length > 1 && Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
                    this.cardImageIndexes[vehicle.id] = (this.getCardIndex(vehicle) + (dx < 0 ? 1 : -1) + images.length) % images.length;
                }
            },

            cancelCardSwipe(vehicle) {
                delete this.cardSwipeStarts[vehicle.id];
                this.cardDetailBlockedUntil[vehicle.id] = Date.now() + 700;
            },

            zoomPhotoCount() {
                return this.selectedVehicle ? this.getVehicleImages(this.selectedVehicle).length : 0;
            },

            zoomPhotoNumber() {
                return this.selectedVehicle ? Math.max(0, this.getVehicleImages(this.selectedVehicle).indexOf(this.activeDetailImage)) + 1 : 0;
            },

            openZoom() {
                if (!this.selectedVehicle || Date.now() < this.suppressZoomUntil) return;
                this.zoomReturnFocus = document.activeElement;
                this.deactivateDetailMagnifier();
                this.resetZoom();
                this.zoomOpen = true;
                this.$nextTick(() => this.$refs.zoomClose?.focus());
            },

            closeZoom() {
                this.zoomOpen = false;
                this.zoomSwipeOrigin = null;
                this.resetZoom();
                this.zoomReturnFocus?.focus?.();
                this.zoomReturnFocus = null;
            },

            zoomIn() { this.zoomScale = Math.min(3, this.zoomScale + 0.25); },
            zoomOut() { this.zoomScale = Math.max(1, this.zoomScale - 0.25); },
            resetZoom() { this.zoomScale = 1; },
            handleZoomWheel(event) {
                if (event.deltaY < 0) this.zoomIn();
                else if (event.deltaY > 0) this.zoomOut();
            },

            changeZoomImage(direction) {
                this.resetZoom();
                this.changeDetailImage(direction, true);
            },

            handleZoomKeydown(event) {
                if (!this.zoomOpen) return;
                if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) {
                    event.preventDefault();
                    if (event.key === 'Escape') this.closeZoom();
                    else this.changeZoomImage(event.key === 'ArrowLeft' ? -1 : 1);
                } else if (event.key === 'Tab') {
                    const buttons = [...this.$refs.zoomViewer.querySelectorAll('button')]
                        .filter(button => button.getClientRects().length && !button.disabled);
                    const first = buttons[0], last = buttons[buttons.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last?.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first?.focus();
                    }
                }
            },

            beginZoomSwipe(event) {
                this.zoomSwipeOrigin = event.touches.length === 1
                    ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
            },

            finishZoomSwipe(event) {
                const origin = this.zoomSwipeOrigin;
                this.zoomSwipeOrigin = null;
                if (!origin || !event.changedTouches.length) return;
                const dx = event.changedTouches[0].clientX - origin.x;
                const dy = event.changedTouches[0].clientY - origin.y;
                if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) this.changeZoomImage(dx < 0 ? 1 : -1);
            },

            activateDetailMagnifier() {
                this.detailMagnifier.active = false;
            },

            moveDetailMagnifier(event) {
                if (!this.detailModalOpen || this.zoomOpen || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
                const image = event.currentTarget;
                if (!image.naturalWidth || !image.naturalHeight) return;
                const rect = image.getBoundingClientRect();
                const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
                const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
                const left = (rect.width - width) / 2, top = (rect.height - height) / 2;
                const x = event.clientX - rect.left, y = event.clientY - rect.top;
                this.detailMagnifier = { active: x >= left && x <= left + width && y >= top && y <= top + height,
                    x, y, left, top, width, height };
            },

            deactivateDetailMagnifier() { this.detailMagnifier.active = false; },

            detailMagnifierStyle() {
                const glass = this.detailMagnifier;
                const diameter = 200;
                const radius = diameter / 2;
                const image = this.activeDetailImage || (this.selectedVehicle && this.getMainImage(this.selectedVehicle));
                return {
                    width: `${diameter}px`, height: `${diameter}px`,
                    left: `${glass.x - radius}px`, top: `${glass.y - radius}px`,
                    backgroundImage: `url(${JSON.stringify(image)})`,
                    backgroundSize: `${glass.width * 2.5}px ${glass.height * 2.5}px`,
                    backgroundPosition: `${radius - (glass.x - glass.left) * 2.5}px ${radius - (glass.y - glass.top) * 2.5}px`
                };
            },

            initGallery() {
                this.$watch('detailModalOpen', open => {
                    if (!open) {
                        this.stopDetailSlideshow();
                        this.deactivateDetailMagnifier();
                        if (this.zoomOpen) this.closeZoom();
                    }
                });
            },

            destroy() {
                this.stopDetailSlideshow();
            },

            moveFormImage(index, target) {
                const images = [...this.formData.uploadedImages];
                if (this.imageUploadBusy || this.vehicleSaving || index < 0 || target < 0 ||
                    index >= images.length || target >= images.length) return;
                const [image] = images.splice(index, 1);
                images.splice(target, 0, image);
                this.formData.uploadedImages = images;
            },

            addImageLinks() {
                const links = this.parseImagesInput(this.formData.imagesInput);
                if (links.some(link => !/^https?:\/\//i.test(link))) {
                    alert('Usa enlaces de imágenes que comiencen con https:// o http://.');
                    return false;
                }
                this.formData.uploadedImages = [...this.formData.uploadedImages, ...links];
                this.formData.imagesInput = '';
                return true;
            },

            startDetailSlideshow() {
                this.stopDetailSlideshow();
                if (!this.selectedVehicle || this.getVehicleImages(this.selectedVehicle).length < 2) return;
                this.detailSlideshowPlaying = true;
                timer = setInterval(() => {
                    if (!this.detailModalOpen || this.zoomOpen || document.hidden ||
                        this.detailGalleryHovered || this.detailSwipeOrigin) return;
                    this.changeDetailImage(1);
                }, 4000);
            },

            stopDetailSlideshow() {
                if (timer !== null) clearInterval(timer);
                timer = null;
                this.detailSlideshowPlaying = false;
            },

            toggleDetailSlideshow() {
                if (this.detailSlideshowPlaying) this.stopDetailSlideshow();
                else this.startDetailSlideshow();
            },

            selectDetailImage(image, manual = true) {
                this.deactivateDetailMagnifier();
                this.activeDetailImage = image;
                if (manual && this.detailSlideshowPlaying) this.startDetailSlideshow();
                this.$nextTick(() => {
                    const strip = this.$refs.detailThumbnails;
                    const index = this.getVehicleImages(this.selectedVehicle).indexOf(image);
                    const thumb = strip?.querySelectorAll('button')[index];
                    if (thumb) strip.scrollTo({
                        left: Math.max(0, thumb.offsetLeft - strip.offsetLeft - (strip.clientWidth - thumb.clientWidth) / 2),
                        behavior: 'smooth'
                    });
                });
            },

            changeDetailImage(direction, manual = false) {
                if (!this.selectedVehicle) return;
                const images = this.getVehicleImages(this.selectedVehicle);
                if (!images.length) return;
                const index = Math.max(0, images.indexOf(this.activeDetailImage));
                this.selectDetailImage(images[(index + direction + images.length) % images.length], manual);
            },

            beginGallerySwipe(event) {
                const touch = event.changedTouches[0];
                this.detailSwipeOrigin = { x: touch.clientX, y: touch.clientY };
            },

            finishGallerySwipe(event) {
                const origin = this.detailSwipeOrigin;
                this.detailSwipeOrigin = null;
                if (!origin) return;
                const touch = event.changedTouches[0];
                const dx = touch.clientX - origin.x;
                const dy = touch.clientY - origin.y;
                if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
                    this.suppressZoomUntil = Date.now() + 400;
                    this.changeDetailImage(dx < 0 ? 1 : -1, true);
                }
            }
        };
    };
})();
