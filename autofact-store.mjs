const base = 'https://xxgqizzuxcvudcpxledg.supabase.co/storage/v1/object/public/vehicle-images/';
export function reportPath(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Publica el vehículo antes de adjuntar su Autofact.');
    return `autofact/${id.toLowerCase()}.pdf`;
}
export const reportUrl = id => base + reportPath(id);
const linkPath = id => reportPath(id).replace(/\.pdf$/, '.json');
export function validateLink(value) {
    // Exact official report URLs only: no redirects, credentials or arbitrary embeds.
    if (typeof value !== 'string' || !/^https:\/\/www\.autofactpro\.com\/informe\/ver\/[a-z0-9]{1,128}$/i.test(value.trim())) {
        throw new Error('Usa un enlace https://www.autofactpro.com/informe/ver/… válido.');
    }
    return value.trim();
}
export async function saveLink(client, id, value) {
    const path = linkPath(id);
    const url = validateLink(value);
    if (!(await client?.auth.getSession())?.data?.session) throw new Error('Inicia sesión para guardar el enlace.');
    const body = new Blob([JSON.stringify({version:1,url})], {type:'application/json'});
    const {error} = await client.storage.from('vehicle-images').upload(path, body, {
        upsert:true, contentType:'application/json', cacheControl:'0'
    });
    if (error) throw new Error('No se pudo guardar el enlace. Revisa tu sesión y los permisos.');
}
export async function getLink(id) {
    const response = await fetch(base + linkPath(id) + '?check=' + Date.now(), {
        cache:'no-store', signal:AbortSignal.timeout(12000)
    });
    if ([400,404].includes(response.status)) return '';
    if (!response.ok) throw new Error('No se pudo comprobar el enlace Autofact.');
    const data = await response.json();
    if (data.version !== 1) throw new Error('Formato de enlace Autofact no válido.');
    return validateLink(data.url);
}
export async function listReports(client) {
    const reports = {};
    for (let offset=0; ; offset+=1000) {
        const {data,error} = await client.storage.from('vehicle-images').list('autofact', {
            limit:1000, offset, sortBy:{column:'name',order:'asc'}
        });
        if (error || !Array.isArray(data)) throw new Error('No se pudo consultar Autofact.');
        for (const item of data) {
            const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(pdf|json)$/i.exec(item.name);
            if (match) reports[match[1].toLowerCase()] = true;
        }
        if (data.length < 1000) return reports;
    }
}
export async function validateFile(file) {
    if (!file || !/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf') || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Selecciona un PDF de hasta 10 MB.');
    if (await file.slice(0,5).text() !== '%PDF-') throw new Error('El archivo no tiene una cabecera PDF válida.');
}
export async function uploadReport(client,id,file) {
    const path = reportPath(id);
    await validateFile(file);
    if (!(await client?.auth.getSession())?.data?.session) throw new Error('Inicia sesión para subir el informe.');
    const result = await client.storage.from('vehicle-images').upload(path,file,{upsert:true,contentType:'application/pdf',cacheControl:'0'});
    if (result.error) throw new Error('No se pudo guardar el PDF. El informe anterior no se ha eliminado. Revisa tu sesión y los permisos de almacenamiento.');
}
export async function exists(id) {
    const response = await fetch(reportUrl(id) + '?check=' + Date.now(),{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (response.ok) return true;
    if ([400,404].includes(response.status)) return false;
    throw new Error('No se pudo comprobar el informe.');
}
