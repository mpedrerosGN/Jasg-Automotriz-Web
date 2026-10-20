# Autofact y precio — rama de pruebas

Rama: `pruebas/autofact-enlace-precio`. No fusionar en `main` hasta aprobación.

## Uso

En Panel de Gestión → Autofact del vehículo, pegar su enlace oficial y pulsar
**Guardar enlace**. Se guarda un pequeño JSON, no una copia del informe.
Los PDFs existentes no se borran. El detalle ofrece **Revisar Autofact ↗** y,
si también hay PDF, **Ver PDF guardado**. Autofact bloquea la inserción en iframe:
el enlace abre otra pestaña conservando el catálogo y sus detalles.
No amplía la información disponible en el informe externo.

El enlace de ejemplo no se ha asignado a ningún vehículo real.
Los enlaces y PDFs son públicos: revisar autorización y datos personales antes
de compartirlos. La autorización de escritura sigue las políticas existentes
de Storage para usuarios autenticados. No se cambian permisos ni esquema SQL.

La etiqueta Autofact usa un listado compartido de archivos, paginado cada
1000 nombres, sin descargar PDFs. Se actualiza al guardar en esta sesión.
El precio ahora está arriba a la derecha y es más compacto en móviles.

## Verificación

- RED: cuatro pruebas nuevas fallaron antes de implementar los enlaces.
- GREEN: pruebas unitarias de URLs, autenticación, persistencia y disponibilidad;
  regresiones de catálogo, equipamiento, galería y marca.
- Navegador: catálogo público y administrador a 320, 390 y 1440 px;
  precio/estado sin superposición, distintivo solo con informe, una consulta
  compartida, enlace en nueva pestaña sin acceso a `opener`, guardado validado.
- Visor PDF: navegación, zoom y subida simulada a 390 y 1440 px.
- Todos los datos y escrituras de estas pruebas son simulados.

Ejecutar con Node 22:

```text
npm ci
npm test
node tests/regressions.cjs
node tests/branding.cjs
npm run build
node tests/autofact-links-browser.cjs
```

GitHub Actions ejecuta estas pruebas y guarda capturas como artefacto.
Netlify ignora ramas `pruebas/`; el build también las bloquea si se ejecuta
dentro de Netlify, para cubrir disparos mediante build hook.
No se configura GitHub Pages ni se publica una copia conectada para editar
vehículos reales. La validación real de permisos del bucket queda pendiente
de una prueba autorizada antes del despliegue.
