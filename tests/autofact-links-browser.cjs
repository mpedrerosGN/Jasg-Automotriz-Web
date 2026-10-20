// Isolated integration: never writes real vehicles or reports.
const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const id='11111111-1111-4111-8111-111111111111';
const url='https://www.autofactpro.com/informe/ver/c08ae82b2ace';
const vehicle={id,brand:'MITSUBISHI',model:'L200 KATANA',year:2022,price:14500000,mileage:126000,category:'Camioneta',status:'Disponible',transmission:'Manual',fuel:'Diésel',images:[],features:[],youtubeUrl:'https://www.youtube.com/watch?v=test'};
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({...(process.env.CI?{channel:'chrome'}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),headless:true});
  for(const html of ['index.html','admin.html'])for(const width of [320,390,1440]){
   const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<500});
   const errors=[];let listCalls=0,uploads=0,pdfDownloads=0;
   page.on('pageerror',e=>errors.push(e.message));
   await page.exposeFunction('testList',()=>{listCalls++;return {data:[{name:id+'.json'}]};});
   await page.exposeFunction('testSave',args=>{assert.equal(args.path,`autofact/${id}.json`);assert.equal(JSON.parse(args.body).url,url);uploads++;});
   await page.route('**/supabase-client.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.jasgSupabase={auth:{getSession:async()=>({data:{session:{access_token:"test"}}})},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:""}}),list:()=>window.testList(),upload:async(path,file)=>{await window.testSave({path,body:await file.text()});return {};}})}};`}));
   await page.route('**/supabase-data.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.jasgDb={listVehicles:async()=>({data:${JSON.stringify([vehicle,{...vehicle,id:'22222222-2222-4222-8222-222222222222',model:'Sin informe'}])}})};`}));
   await page.route('**/storage/v1/object/public/vehicle-images/autofact/**',r=>{
    const isJson=new URL(r.request().url()).pathname.endsWith('.json');
    if(!isJson&&r.request().method()!=='HEAD')pdfDownloads++;
    return r.fulfill({status:isJson?200:404,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:isJson?JSON.stringify({version:1,url}):''});
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/${html}`,{waitUntil:'networkidle'});
   await page.locator('.vehicle-card-autofact:visible').waitFor();
   assert.equal(await page.locator('.vehicle-card-autofact:visible').count(),1);
   assert.equal(listCalls,1,'All cards share one metadata listing');
   const price=await page.locator('.vehicle-card-price').first().boundingBox();
   const status=await page.locator('.vehicle-card-status').first().boundingBox();
   assert.ok(price.x>=status.x+status.width,'Status and price do not overlap');
   assert.ok(Math.abs(price.y-status.y)<2,'Price is at the top beside status');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   fs.mkdirSync(path.join(root,'.tools'),{recursive:true});
   await page.locator('.vehicle-card-price').first().locator('..').screenshot({path:path.join(root,`.tools/autofact-card-${html}-${width}.png`)});
   await page.evaluate(v=>Alpine.$data(document.body).openDetailModal(v),vehicle);
   const link=page.getByRole('link',{name:'Revisar Autofact ↗',exact:true});
   await link.waitFor();assert.equal(await link.getAttribute('href'),url);
   assert.equal(await link.getAttribute('target'),'_blank');
   assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
   await page.context().route('https://www.autofactpro.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Informe externo de prueba</h1>'}));
   const popupPromise=page.waitForEvent('popup');
   await link.click();
   const popup=await popupPromise;
   await popup.waitForLoadState();
   assert.equal(popup.url(),url);
   assert.equal(await popup.evaluate(()=>window.opener),null);
   assert.equal(await page.evaluate(()=>Alpine.$data(document.body).detailModalOpen),true);
   await popup.close();
   assert.equal(pdfDownloads,0,'No PDF download for external report');
   if(html==='admin.html'){
    await page.evaluate(v=>window.jasgAutofact.manage(v),vehicle);
    const field=page.getByLabel('Enlace del informe',{exact:true});
    await field.fill('https://evil.example/report');
    await page.getByRole('button',{name:'Guardar enlace',exact:true}).click();
    await page.getByText('Usa un enlace https://www.autofactpro.com/informe/ver/… válido.',{exact:true}).waitFor();
    assert.equal(uploads,0);
    await field.fill(url);
    await page.getByRole('button',{name:'Guardar enlace',exact:true}).click();
    await page.getByText('Enlace guardado. El PDF existente se conserva como alternativa.',{exact:true}).waitFor();
    assert.equal(uploads,1);
    await page.getByRole('button',{name:'Cerrar Autofact',exact:true}).click();
    assert.equal(await page.evaluate(()=>Alpine.$data(document.body).detailModalOpen),true);
   }
   assert.deepEqual(errors,[]);
   console.log(`PASS ${html} ${width}px: top price, badges, safe external link, lazy loading, admin validation`);
   await page.close();
  }
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
