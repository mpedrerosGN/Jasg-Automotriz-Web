# Mantenedor de logo

En **Panel de Gestión → Logo de la automotora → Administrar logo**, seleccionar
una imagen, revisar la vista previa y pulsar **Guardar logo**. Cancelar cambio
descarta la selección. **Usar logo original** prepara el logo incluido en el sitio;
también requiere pulsar Guardar logo para publicarlo.

Se aceptan PNG, JPG y WebP de hasta 5 MB y 40 megapíxeles. La imagen se convierte
a PNG, conservando transparencia y proporciones, con un máximo de 1024 píxeles
en su lado mayor. Los nombres y mensajes se presentan como texto, no HTML.

## Persistencia

- Objeto público: bucket `vehicle-images`, ruta `branding/site-logo.png`.
- Se reutilizan las políticas existentes de Storage: lectura pública y
  escritura de usuarios autenticados. No se agregan permisos ni SQL.
- Antes de guardar se valida el usuario con `auth.getUser()`. Supabase aplica
  además sus políticas de acceso; no se utiliza ninguna clave privilegiada.
- Guardar reemplaza el logo compartido con `upsert: true`; no toca los objetos
  de fotografías de vehículos, las publicaciones ni el banner del catálogo.
- Se usa `cacheControl: '0'` y una URL versionada por lectura/guardado. Las
  pestañas públicas ya abiertas muestran el cambio al recargarlas.
- Se actualizan encabezados público/administrativo, distintivos de vendidos e
  inicio de sesión. Sin logo guardado o si no se puede cargar, se conserva el
  archivo original como alternativa.
- No se mantiene historial de logos anteriores; se puede volver a subir un
  archivo o restaurar el original.

## Verificación

Pruebas: `node tests/branding.cjs` y `node tests/regressions.cjs`.
En esta sesión se ejecutaron ambos módulos en Node REPL con `createRequire`
porque Node no estaba disponible en PATH.

- RED: 12 pruebas nuevas fallaron antes de implementar el módulo. Checkpoint
  `573dc09`.
- GREEN: 16 pruebas de logos y las 35 regresiones anteriores pasan.
- Se probaron persistencia y lectura pública con Storage simulado, rechazo de
  usuarios anónimos, formatos/firmas/tamaños, conversión proporcional, vista
  previa, cancelación, restauración, errores, bloqueo durante guardado e
  integración de las tres páginas.
- Cobertura V8 de funciones en `site-branding.js`: 22/24 (91,7 %).
- Sintaxis de scripts internos y módulo comprobada con `vm.Script`.
- Consulta real, solo lectura, a la ruta pública confirmó que todavía no existe
  un logo personalizado (HTTP 400 con `statusCode: 404`, `NoSuchKey`).

No hubo navegador conectado para verificación visual. La conversión gráfica y
Storage se simularon en las pruebas. No se subió un logo real ni se hizo una
prueba de escritura autenticada en producción: el logo actual se conserva hasta
que el administrador guarde una imagen desde el mantenedor.
