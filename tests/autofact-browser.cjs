const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const id='11111111-1111-4111-8111-111111111111';
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];let pdfRequests=0,uploads=0;
   page.on('pageerror',error=>errors.push(error.message));
   await page.exposeFunction('testUpload',()=>{uploads++;});
   await page.route('**/supabase-client.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.jasgSupabase={auth:{getSession:async()=>({data:{session:{access_token:"test"}}})},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:""}}),upload:async()=>{await window.testUpload();return {error:null};}})}};'}));
   await page.route('**/supabase-data.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.jasgDb={listVehicles:async()=>({data:[]})};'}));
   await page.route('**/storage/v1/object/public/vehicle-images/autofact/**',route=>{if(new URL(route.request().url()).pathname.endsWith('.json'))return route.fulfill({status:404,headers:{'access-control-allow-origin':'*'}});if(route.request().method()==='HEAD')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/pdf'}});pdfRequests++;return route.fulfill({contentType:'application/pdf',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(path.join(root,'.tools/autofact-test.pdf'))});});
   await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`,{waitUntil:'networkidle'});
   assert.equal(pdfRequests,0);
   const vehicle={id,brand:'JASG',model:'Prueba local',year:2026,price:100,mileage:0,status:'Disponible',images:[],features:[]};
   await page.evaluate(v=>Alpine.$data(document.body).openDetailModal(v),vehicle);
   await page.getByRole('button',{name:'Revisar Autofact',exact:true}).waitFor();assert.equal(pdfRequests,0);
   await page.getByRole('button',{name:'Revisar Autofact',exact:true}).click();
   const frame=page.frameLocator('iframe[title="Visor del informe Autofact"]');
   await frame.locator('#page').filter({hasText:'1 / 14'}).waitFor({timeout:30000});
   await frame.getByRole('button',{name:'Página siguiente',exact:true}).click();
   await frame.locator('#page').filter({hasText:'2 / 14'}).waitFor();
   await frame.getByRole('button',{name:'Aumentar zoom',exact:true}).click();
   await frame.getByRole('button',{name:'125%',exact:true}).waitFor();
   await frame.getByRole('button',{name:'125%',exact:true}).click();
   await frame.getByRole('button',{name:'Ajustar',exact:true}).waitFor();
   await page.locator('dialog').screenshot({path:path.join(root,`.tools/autofact-${width}.png`)});
   await page.getByRole('button',{name:'Cerrar Autofact',exact:true}).click();
   assert.equal(await page.evaluate(()=>Alpine.$data(document.body).detailModalOpen),true);
   assert.equal(await page.locator('dialog').count(),0);
   await page.evaluate(v=>window.jasgAutofact.manage(v),vehicle);
   await page.getByLabel('Seleccionar informe PDF').setInputFiles(path.join(root,'.tools/autofact-test.pdf'));
   await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Guardar PDF',exact:true}).click();
   await page.getByText('PDF publicado correctamente. Ya está disponible en el detalle del vehículo.',{exact:true}).waitFor({timeout:30000});
   assert.equal(uploads,1);assert.deepEqual(errors,[]);
   console.log(`PASS Autofact ${width}px: lazy PDF, pages, zoom, close retains details, validated upload (local mocks only)`);
   await page.close();
  }
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
