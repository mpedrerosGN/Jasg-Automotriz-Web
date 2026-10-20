(() => {
    let storePromise;
    const store = () => storePromise ||= import('/autofact-store.mjs');
    function dialog(title) {
        const element = document.createElement('dialog');
        element.className = 'autofact-dialog';
        element.setAttribute('aria-label',title);
        const head = document.createElement('div'); head.className = 'autofact-head';
        const heading = document.createElement('strong'); heading.textContent = title;
        const close = document.createElement('button'); close.type='button';close.textContent='Cerrar';close.setAttribute('aria-label','Cerrar Autofact');
        close.onclick=()=>element.close();head.append(heading,close);element.append(head);
        const previousFocus=document.activeElement;
        element.addEventListener('close',()=>{element.remove();previousFocus?.focus();});
        element.addEventListener('keydown',event=>event.stopPropagation());
        document.body.append(element); element.showModal();return element;
    }
    window.jasgAutofact = {
        review(id) {
            const modal = dialog('Revisar Autofact');
            const iframe=document.createElement('iframe');iframe.title='Visor del informe Autofact';
            iframe.src='/autofact-viewer.html?vehicle='+encodeURIComponent(id);
            iframe.className='autofact-frame';modal.append(iframe);
        },
        async manage(vehicle) {
            const modal=dialog(`Autofact · ${vehicle.brand} ${vehicle.model}`);
            const content=document.createElement('div');content.className='autofact-manage';
            // Static markup only; vehicle and file names are assigned via textContent.
            content.innerHTML='<p>Sube o reemplaza el informe de esta publicación. PDF sin contraseña, hasta 10 MB y 500 páginas.</p><p><strong>El documento será público.</strong> Oculta RUT, domicilios y otros datos personales que no deban publicarse. Sube solo documentos que tengas autorización para compartir.</p><label>Seleccionar informe PDF<input type="file" accept="application/pdf,.pdf"></label><label><input type="checkbox"> Confirmo que revisé el PDF y autorizo su publicación.</label><div class="autofact-actions"><button type="button" data-save>Guardar PDF</button><button type="button" data-review hidden>Revisar Autofact actual</button></div><p role="status" aria-live="polite"></p>';
            modal.append(content);
            const input=content.querySelector('input[type=file]'),consent=content.querySelector('input[type=checkbox]'),save=content.querySelector('[data-save]'),review=content.querySelector('[data-review]'),status=content.querySelector('[role=status]');
            review.onclick=()=>window.jasgAutofact.review(vehicle.id);
            let busy=false;
            modal.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
            save.onclick=async()=>{
                if(busy)return;
                if(!consent.checked){status.textContent='Debes confirmar que autorizas la publicación del documento.';return;}
                busy=true;save.disabled=true;input.disabled=true;modal.querySelector('.autofact-head button').disabled=true;
                let task;
                try {
                    const api=await store();await api.validateFile(input.files[0]);
                    status.textContent='Validando PDF…';
                    const pdf=await import('/vendor/pdfjs/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
                    task=pdf.getDocument({data:new Uint8Array(await input.files[0].arrayBuffer()),isEvalSupported:false});
                    task.onPassword=()=>{task.destroy();};
                    const document=await task.promise;
                    if(document.numPages>500)throw new Error('El PDF supera el máximo de 500 páginas.');
                    status.textContent='Guardando PDF…';
                    await api.uploadReport(window.jasgSupabase,vehicle.id,input.files[0]);
                    status.textContent='PDF publicado correctamente. Ya está disponible en el detalle del vehículo.';review.hidden=false;input.value='';consent.checked=false;
                    window.dispatchEvent(new Event('autofact-updated'));
                } catch(error) {status.textContent=error?.message?.includes('PDF') || error?.message?.includes('sesión') ? error.message : 'No se pudo publicar. Usa un PDF válido, sin contraseña, y vuelve a intentarlo.';}
                finally {await task?.destroy();busy=false;save.disabled=false;input.disabled=false;modal.querySelector('.autofact-head button').disabled=false;}
            };
            try {review.hidden=!(await (await store()).exists(vehicle.id));}catch{status.textContent='No se pudo comprobar el informe actual. Puedes reintentar abriendo este panel.';}
        }
    };
    window.jasgAutofactButton=()=>({
        available:false,checking:false,error:'',checkedId:null,sequence:0,
        async check(id,force=false){
            if(!id || (!force && id===this.checkedId))return;
            this.checkedId=id;this.available=false;this.checking=true;this.error='';const sequence=++this.sequence;
            try{const available=await (await store()).exists(id);if(sequence===this.sequence)this.available=available;}
            catch{if(sequence===this.sequence)this.error='No se pudo comprobar Autofact.';}
            finally{if(sequence===this.sequence)this.checking=false;}
        }
    });
})();
