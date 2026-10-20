const base = 'https://xxgqizzuxcvudcpxledg.supabase.co/storage/v1/object/public/vehicle-images/';
export function reportPath(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Publica el vehículo antes de adjuntar su Autofact.');
    return `autofact/${id.toLowerCase()}.pdf`;
}
export const reportUrl = id => base + reportPath(id);
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
