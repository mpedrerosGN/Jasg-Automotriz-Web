# Estadísticas reales

Panel de Gestión → Visitas y rendimiento real. Actualización manual; períodos hoy, 7, 30 y 90 días. Días calculados en America/Santiago.

Se miden sesiones por pestaña (30 minutos de inactividad, separadas también por día), páginas vistas, aperturas de detalle de vehículos, clics en WhatsApp y enlaces sociales/teléfono. No son personas únicas, conversaciones ni ventas. País aproximado proporcionado por Netlify; fuentes según referente del navegador, sin guardar URLs completas. Directo incluye referencias no disponibles. No hay datos retrospectivos ni valores de demostración.

## Operación y seguridad

- Netlify Functions + almacén del sitio `jasg-analytics-v1` en Netlify Blobs; persiste entre despliegues. Dependencias fijadas en package-lock.json. Consumo sujeto a cuotas y facturación existentes de Netlify.
- No se modifican tablas Supabase, vehículos, imágenes ni credenciales.
- Consulta protegida por token validado contra Supabase Auth. Conserva el modelo vigente: todos los usuarios autenticados administran el catálogo. Mantener deshabilitado el registro público si no corresponde admitir nuevos administradores.
- Eventos públicos validados, origen del sitio, límite 60 solicitudes/minuto por IP/dominio; consultas 15/minuto. El servicio de hosting procesa IP para transporte/geolocalización/límites, pero esta aplicación no la almacena en sus estadísticas.
- Se excluyen previews, bots identificables, DNT/GPC y sesiones de administrador en navegador. No es un sistema antifraude: clientes falsificados pueden enviar eventos y bloqueadores pueden omitirlos.
- Ocho particiones por día; escritura condicional y deduplicación de eventos. Capacidad máxima 5000 eventos por partición/día. Se conservan agregados y deduplicadores en Blobs; no se implementó borrado automático. Revisar cuotas si aumenta significativamente el tráfico.
- Solo se publican archivos explícitamente enumerados en scripts/build.cjs. Los tests, dependencias y servidor no se publican como archivos estáticos.

## Evidencia de pruebas

Recorridos derivados del pedido del usuario. RED inicial: 8 fallos por implementación ausente (e11661d); GREEN del contador: 9/9 (b868923). Integración RED: un fallo por conexión ausente (acc9964); GREEN: 11/11 (bc731c0).

Validación ampliada: `node --test --experimental-test-coverage tests/analytics.test.cjs`: 16/16; backend 100% líneas, 97.06% ramas HTTP y 100% ramas del contador. Las pruebas de navegador ejecutadas por VM no están incluidas en esa cobertura de archivos.

`node tests/regressions.cjs`: 43/43. `node tests/branding.cjs`: 16/16.

`node tests/analytics-browser.cjs`: Chrome sin ventana, escritorio 1440×1000 y celular emulado 390×844. Verifica autenticación, datos, selector, estados de error, ausencia de errores JavaScript y desbordamiento horizontal. Todos los datos de esta prueba son fixtures interceptados localmente, nunca enviados a producción. No equivale a probar un teléfono físico.

`node scripts/build.cjs`: correcto. Instalación npm: cero vulnerabilidades reportadas.

No se dispone de sesión real de administrador para comprobar su lectura autenticada en producción. La comprobación pública del endpoint debe devolver 401 sin token. Nunca enviar eventos sintéticos a producción para probar el contador.
