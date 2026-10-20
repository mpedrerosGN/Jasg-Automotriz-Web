const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = '../autofact-store.mjs';
const core = fs.existsSync(require('node:path').join(__dirname,file)) ? import(file) : Promise.resolve({});
const id = '11111111-1111-4111-8111-111111111111';
const link = 'https://www.autofactpro.com/informe/ver/c08ae82b2ace';
test('Autofact browser assets remain relative for GitHub Pages subpaths',()=>{
 for(const fileName of ['autofact.js','autofact-viewer.mjs','autofact-viewer.html']){
  const source=fs.readFileSync(require('node:path').join(__dirname,'..',fileName),'utf8');
  assert.doesNotMatch(source,/import\(['"]\//,`${fileName} must not dynamically import from the domain root`);
  assert.doesNotMatch(source,/(?:src|href)=["']\//,`${fileName} must not reference browser assets from the domain root`);
 }
});
test('Autofact detail exposes only the uploaded PDF viewer',()=>{
 for(const fileName of ['index.html','admin.html']){
  const source=fs.readFileSync(require('node:path').join(__dirname,'..',fileName),'utf8');
  assert.doesNotMatch(source,/x-show="url"|window\.jasgAutofact\.openUrl\(/,`${fileName} must not expose external Autofact links`);
  assert.match(source,/window\.jasgAutofact\.review\(selectedVehicle\.id\)/);
 }
 assert.doesNotMatch(fs.readFileSync(require('node:path').join(__dirname,'..','autofact.js'),'utf8'),/window\.jasgAutofact\.openUrl\(/);
});
test('external reports accept only official HTTPS report links',async()=>{
 const api=await core;
 assert.equal(api.validateLink(' '+link+' '),link);
 for(const value of ['javascript:alert(1)','https://evil.com/informe/ver/abc',link+'?redirect=evil',link+'#x','https://www.autofactpro.com.evil.com/informe/ver/abc','https://user@www.autofactpro.com/informe/ver/abc','http://www.autofactpro.com/informe/ver/abc','https://www.autofactpro.com:8080/informe/ver/abc',null]) assert.throws(()=>api.validateLink(value));
});
test('saving links authenticates and preserves existing PDFs',async()=>{
 const api=await core,calls=[];
 const client={auth:{getSession:async()=>({data:{session:null}})},storage:{from:()=>({upload:async(...args)=>{calls.push(args);return {};}})}};
 await assert.rejects(()=>api.saveLink(client,id,link));assert.equal(calls.length,0);
 client.auth.getSession=async()=>({data:{session:{}}});
 await api.saveLink(client,id,link);
 assert.equal(calls[0][0],`autofact/${id}.json`);
 assert.deepEqual(JSON.parse(await calls[0][1].text()),{version:1,url:link});
 assert.equal(calls[0][2].contentType,'application/json');
 client.storage.from=()=>({upload:async()=>({error:{}})});
 await assert.rejects(()=>api.saveLink(client,id,link));
});
test('report metadata handles absence, unsafe links and server errors',async()=>{
 const api=await core,original=global.fetch;
 try{
  global.fetch=async()=>Response.json({version:1,url:link});assert.equal(await api.getLink(id),link);
  global.fetch=async()=>new Response(null,{status:404});assert.equal(await api.getLink(id),'');
  global.fetch=async()=>Response.json({version:1,url:'javascript:alert(1)'});await assert.rejects(()=>api.getLink(id));
  global.fetch=async()=>new Response(null,{status:503});await assert.rejects(()=>api.getLink(id));
 }finally{global.fetch=original;}
});
test('badge index lists metadata without downloading PDFs',async()=>{
 const api=await core;let calls=0;
 const client={storage:{from:()=>({list:async()=>{calls++;return {data:[{name:id+'.pdf'},{name:id+'.json'},{name:'not-a-report.txt'}]};}})}};
 assert.deepEqual(await api.listReports(client),{[id]:true});assert.equal(calls,1);
 client.storage.from=()=>({list:async()=>({error:{}})});
 await assert.rejects(()=>api.listReports(client));
});
test('badge index paginates and ignores folders and unknown names',async()=>{
 const api=await core,offsets=[];
 const client={storage:{from:()=>({list:async(_,options)=>{
  offsets.push(options.offset);
  return {data:options.offset===0?Array.from({length:1000},()=>({name:'unrelated'})):[{name:id+'.pdf'}]};
 }})}};
 assert.deepEqual(await api.listReports(client),{[id]:true});
 assert.deepEqual(offsets,[0,1000]);
 const original=global.fetch;
 try{global.fetch=async()=>Response.json({version:2,url:link});await assert.rejects(()=>api.getLink(id));}
 finally{global.fetch=original;}
});
test('report paths are restricted to vehicle UUIDs',async()=>{
 const api=await core;
 assert.equal(api.reportPath(id),`autofact/${id}.pdf`);
 assert.throws(()=>api.reportPath('../private'));
});
test('PDF uploads reject disguised, empty and oversized files',async()=>{
 const api=await core;
 await api.validateFile(new File(['%PDF-1.7\nreport'],'report.pdf',{type:'application/pdf'}));
 for (const f of [new File(['html'],'x.pdf',{type:'application/pdf'}),new File(['%PDF-1.7'],'x.html'),new File([],'x.pdf')]) await assert.rejects(()=>api.validateFile(f));
 await assert.rejects(()=>api.validateFile({name:'x.pdf',type:'application/pdf',size:11*1024*1024}));
});
test('upload requires auth and never removes the previous report first',async()=>{
 const api=await core; const calls=[];
 const client={auth:{getSession:async()=>({data:{session:null}})},storage:{from:()=>({upload:async(...args)=>{calls.push(args);return {error:null};}})}};
 const f=new File(['%PDF-1.7\nreport'],'x.pdf',{type:'application/pdf'});
 await assert.rejects(()=>api.uploadReport(client,id,f)); assert.equal(calls.length,0);
 client.auth.getSession=async()=>({data:{session:{user:{id:'admin'}}}});
 await api.uploadReport(client,id,f);
 assert.equal(calls[0][0],`autofact/${id}.pdf`); assert.equal(calls[0][2].upsert,true);
});
test('existence checks distinguish absent reports and network failures',async()=>{
 const api=await core,original=global.fetch;
 try{
  for(const status of [200,400,404]){global.fetch=async()=>new Response(null,{status});assert.equal(await api.exists(id),status===200);}
  global.fetch=async()=>new Response(null,{status:503});await assert.rejects(()=>api.exists(id));
  assert.match(api.reportUrl(id),/^https:\/\/xxgqizzuxcvudcpxledg\.supabase\.co\//);
 }finally{global.fetch=original;}
});
test('failed upload surfaces error instead of reporting publication',async()=>{
 const api=await core;
 const client={auth:{getSession:async()=>({data:{session:{}}})},storage:{from:()=>({upload:async()=>({error:{message:'denied'}})})}};
 await assert.rejects(()=>api.uploadReport(client,id,new File(['%PDF-1.7\nreport'],'x.pdf',{type:'application/pdf'})),/No se pudo guardar/);
});
