const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = '../autofact-store.mjs';
const core = fs.existsSync(require('node:path').join(__dirname,file)) ? import(file) : Promise.resolve({});
const id = '11111111-1111-4111-8111-111111111111';
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
