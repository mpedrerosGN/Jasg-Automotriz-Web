# Autofact por vehículo

Panel de Gestión → fila del vehículo → Autofact. Seleccionar PDF, confirmar que se revisó la información pública y Guardar PDF. Para vehículos nuevos, publicar primero el vehículo y luego adjuntar el informe desde su fila.

El detalle público y administrativo muestra «Revisar Autofact» cuando existe un documento. El visor abre dentro de un diálogo, sin navegar fuera del sitio. Incluye página anterior/siguiente, zoom, ajustar al ancho y texto accesible de cada página. Cerrar vuelve al detalle. No requiere un lector PDF nativo del navegador.

## Almacenamiento y límites

- Bucket existente `vehicle-images`, ruta `autofact/<uuid-vehiculo>.pdf`; no cambia tablas ni SQL. Un PDF por vehículo; reemplazo autenticado por Supabase RLS. No se elimina primero el archivo anterior.
- Archivos públicos: no subir RUT, domicilios u otros datos personales sin autorización. El control administrativo exige confirmación explícita antes de publicar.
- Hasta 10 MB y 500 páginas, sin contraseña. Se verifica extensión, MIME cuando está disponible, firma `%PDF-` y parseo con PDF.js antes de subir. Esto no es un antivirus ni una validación de autenticidad Autofact. Las políticas actuales permiten almacenamiento a usuarios autenticados: la validación del formulario no es un límite servidor para clientes API externos.
- Borrar un vehículo no elimina automáticamente su PDF público. Para revocar el acceso al archivo, eliminar específicamente su objeto en Supabase Storage. No se agregó borrado destructivo automático.

## Rendimiento y seguridad

PDF.js 6.4.299 de Mozilla fijado en package-lock y servido desde el propio sitio. Se carga solo al abrir un informe o validar una subida. El catálogo añade un controlador pequeño; al abrir detalles realiza HEAD, nunca descarga todos los PDFs del inventario. Se renderiza una página a la vez y se limita el canvas a 8 millones de píxeles. No se ejecutan scripts ni acciones embebidas; `isEvalSupported:false`. Cerrar el diálogo destruye su iframe.

## Verificación

RED: 3 pruebas fallaron por implementación ausente. GREEN: rutas UUID, validación y carga autenticada pasan; pruebas adicionales cubren inexistencia/error de red/fallo de subida. Las regresiones existentes de imágenes, equipamiento y logos siguen pasando.

Prueba Chrome local en 1440 y 390 px con PDF público de ejemplo de Mozilla (14 páginas): apertura diferida, siguiente página, zoom, ajuste, cierre conservando el detalle y carga validada mediante mocks. Se inspeccionaron capturas del render. No se subieron PDFs de prueba ni se alteraron vehículos reales. La sesión real de administrador y teléfonos físicos deben verificarse por el usuario.

Descargar fixture de prueba en `.tools/autofact-test.pdf` desde https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf; luego `node scripts/build.cjs` y `node tests/autofact-browser.cjs`. Pruebas de unidad: `node --test --experimental-test-coverage tests/autofact.test.cjs`.
