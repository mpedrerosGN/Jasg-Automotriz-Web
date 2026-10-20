import {reportUrl} from './autofact-store.mjs';
const $=id=>document.getElementById(id);
let pdf, pageNumber=1,zoom=1,busy=false;
async function render(){
    if(!pdf||busy)return;
    busy=true;for(const button of document.querySelectorAll('button'))button.disabled=true;
    try{
        const page=await pdf.getPage(pageNumber),original=page.getViewport({scale:1});
        const fit=Math.max(100,$('stage').clientWidth-24)/original.width;
        const scale=fit*zoom,viewport=page.getViewport({scale});
        const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(8000000/(viewport.width*viewport.height)));
        const canvas=$('canvas');canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
        await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;
        $('page').textContent=`${pageNumber} / ${pdf.numPages}`;$('fit').textContent=zoom===1?'Ajustar':Math.round(zoom*100)+'%';
        const text=await page.getTextContent();$('text').textContent=text.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('');
        $('status').textContent='';
    }catch{$('status').textContent='No se pudo mostrar esta página. Intenta otra página o vuelve a abrir el informe.';}
    finally{busy=false;for(const button of document.querySelectorAll('button'))button.disabled=false;$('prev').disabled=pageNumber<=1;$('next').disabled=pageNumber>=pdf.numPages;$('minus').disabled=zoom<=.75;$('plus').disabled=zoom>=2.5;}
}
$('prev').onclick=()=>{pageNumber--;void render();};$('next').onclick=()=>{pageNumber++;void render();};
$('minus').onclick=()=>{zoom=Math.max(.75,zoom-.25);void render();};$('plus').onclick=()=>{zoom=Math.min(2.5,zoom+.25);void render();};$('fit').onclick=()=>{zoom=1;void render();};
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>void render(),200);});
try{
    const url=reportUrl(new URL(location.href).searchParams.get('vehicle'));
    const library=await import('/vendor/pdfjs/pdf.mjs');library.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
    const task=library.getDocument({url:url+'?v='+Date.now(),isEvalSupported:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
    task.onPassword=()=>{ $('status').textContent='Este PDF tiene contraseña. Solicita un informe sin protección.';void task.destroy(); };
    pdf=await task.promise;await render();
    window.addEventListener('pagehide',()=>{void task.destroy();},{once:true});
}catch{$('status').textContent='No se pudo abrir el informe. Puede no estar disponible, estar protegido o haber un problema de conexión. Cierra el visor y vuelve a intentarlo.';$('page').textContent='No disponible';}
