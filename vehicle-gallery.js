(function () {
    window.jasgGallery = function () {
        let timer = null;
        return {
            detailSlideshowPlaying: false,
            detailGalleryHovered: false,
            detailSwipeOrigin: null,
            imageUploadBusy: false,
            vehicleSaving: false,

            initGallery() {
                this.$watch('detailModalOpen', open => {
                    if (!open) this.stopDetailSlideshow();
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
                    this.changeDetailImage(dx < 0 ? 1 : -1, true);
                }
            }
        };
    };
})();
