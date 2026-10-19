# Estadísticas reales

## Tablero KPI gráfico — 19 de octubre de 2026

Diseño blanco, negro y dorado, tarjetas KPI, curva/área SVG con valores diarios accesibles, anillo CSS por dispositivo y barras de distribución. No se agregan paquetes ni librerías gráficas. Se conservan métricas, filtros, diagnóstico y estados vacíos/errores.

La primera consulta se difiere hasta abrir Panel de Gestión; regresar al catálogo y volver reutiliza la respuesta. Actualizar y cambiar período sí consultan. No hay temporizadores, polling ni animaciones continuas. Los archivos del catálogo público, el recolector y el backend no cambian en esta entrega.

TDD: prueba de geometría inicialmente falló por método ausente (19/20); luego 20/20. Prueba Chrome a 1440 y 390 px verifica cero consultas antes de abrir gestión, reutilización, filtros, gráficos, diagnóstico, errores y ausencia de desbordamiento. Los gráficos usan fixtures locales de prueba, nunca valores de demostración en producción. No es una medición de Core Web Vitals de usuarios reales ni una garantía de latencia del servidor.

## Actualización del 18 de octubre de 2026

- Diagnóstico protegido `GET /api/analytics/stats?diagnostic=1`: país estimado de la conexión actual proporcionado por Netlify. No consulta ni escribe Blobs, no registra IP ni devuelve ciudad/coordenadas. No corrige ni atribuye el historial. Para resolver la discrepancia reportada, el administrador debe ejecutarlo desde su conexión y comparar Wi-Fi/datos móviles si corresponde.
- Comparación con el período inmediatamente anterior de igual cantidad de días calendario. El día actual es parcial. No se calcula crecimiento porcentual sin base anterior o sin cobertura histórica suficiente.
- Medición ampliada aditiva: sesiones con detalles, sesiones con WhatsApp y tasa global de clic de contacto. Se deduplica por sesión/día, no por persona. No son ventas ni mensajes confirmados. Los datos anteriores permanecen intactos; estas métricas no se reconstruyen retrospectivamente.
- Ranking ordenable por aperturas o clics WhatsApp, con tasa por vehículo: sesiones que hicieron ambas acciones / sesiones que abrieron detalles, independientemente del orden. Contactos sin detalle se excluyen de esta tasa.
- `utm_source` admite instagram/facebook/google/bing; `utm_campaign` admite nombres de 1–40 caracteres minúsculos alfanuméricos, guion y guion bajo. No usar datos personales. Se retiene la atribución inicial durante la sesión. Los parámetros son declarados por el enlace y no verifican quién publicó la campaña.
- Filtro ampliado de agentes automatizados identificables y `navigator.webdriver`; no garantiza bloquear toda automatización ni reclasifica tráfico antiguo.
- Pruebas RED: 16/18 antes de comparación/diagnóstico/contactos; 18/19 antes de tasa por vehículo. GREEN: 19/19, cobertura backend 100% líneas y más del 94% ramas. Chrome local 1440px y 390px verifica también diagnóstico sin conteo. No se enviaron eventos de prueba a producción.

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
