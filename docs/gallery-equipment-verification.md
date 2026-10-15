# Galería y equipamiento — 15 de octubre de 2026

Cambios derivados de la solicitud del usuario: lupa únicamente dentro del detalle,
navegación entre fotos ampliadas en escritorio y móvil, y persistencia del
equipamiento desde la creación de la publicación.

## Pruebas

Ejecutar con Node.js: `node tests/regressions.cjs`.
En esta sesión, sin Node en PATH, se ejecutó el mismo módulo con Node REPL:
`await require('./tests/regressions.cjs')()` mediante `createRequire`.

- RED: 14 de las 15 pruebas iniciales fallaron por ausencia de persistencia,
  lupa en las tarjetas del administrador y navegación ampliada no implementada.
  Checkpoint: `af0b022`.
- GREEN: 31 de 31 pruebas pasan, incluyendo el formulario de creación completo,
  recarga desde la base simulada, edición, eliminación de accesorios,
  normalización, fallos de API, teclado, gestos, límites del zoom, foco,
  pausa del carrusel y posición de la lupa en imágenes con márgenes.
- La simulación de Supabase mantiene tablas y relaciones en memoria; las pruebas
  no escriben publicaciones de prueba en producción.
- Cobertura de funciones medida con V8 Inspector (`Profiler.startPreciseCoverage`):
  `supabase-data.js`: 18/19 (94,7 %); `vehicle-gallery.js`: 32/35 (91,4 %).
  No se midió cobertura de líneas o ramas de todo el sitio.
- JavaScript comprobado con `vm.Script`; `git diff --check` sin errores.

## Alcance y limitaciones

Se reutilizan las tablas y permisos actuales. Las consultas de equipamiento usan
el cliente Supabase y filtros por ID del vehículo. Se insertan las relaciones nuevas
antes de retirar las desmarcadas; los errores se propagan al formulario. El ID de
una publicación nueva se conserva al reintentar un guardado parcial.

El guardado sigue siendo una secuencia de peticiones, no una transacción atómica.
Una interrupción puede dejar un guardado parcial; el formulario permanece abierto
para reintentar con el mismo ID. No se modificaron SQL, permisos ni credenciales.

No hubo navegador Chrome o integrado disponible para E2E visuales. La navegación
táctil se probó con eventos simulados; queda pendiente la comprobación visual en
un teléfono y navegador reales, así como una creación autenticada contra Supabase.
El equipamiento que nunca se guardó anteriormente no se recupera automáticamente.
