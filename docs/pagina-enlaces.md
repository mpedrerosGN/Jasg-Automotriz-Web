# Página de enlaces JASG

Dirección permanente para las tarjetas:
https://jasg-automotriz-web.netlify.app/enlaces/

La página conserva las redes y dirección entregadas por el usuario. Teléfono y
WhatsApp confirmados: +56 9 7569 4441. El HTML está en `enlaces/index.html` para
que Netlify publique la ruta `/enlaces/` sin reemplazar el catálogo principal.

Se utiliza el logo proporcionado como alternativa. Si existe un logo guardado
en el mantenedor, se muestra ese logo compartido. La página y los enlaces siguen
funcionando si JavaScript o Supabase no están disponibles.

## QR para las tarjetas

- PNG: `/enlaces/qr-jasg-enlaces.png` (1000 × 1000).
- SVG: `/enlaces/qr-jasg-enlaces.svg` (vectorial para impresión).
- Ambos codifican directamente la URL de la página, sin acortadores ni servicio
  de redirección del proveedor del QR.
- Generados después de verificar HTTP 200 y coincidencia del HTML publicado.
- Generación: QRServer, https://goqr.me/api/doc/create-qr-code/.

Mantener la URL publicada para conservar la validez de las tarjetas. Cambiar
los enlaces dentro de la página no requiere otro QR. Conservar el borde blanco
y comprobar una impresión de prueba con un teléfono antes de imprimir el lote.

## Verificación

Sintaxis del JavaScript, destinos de los cinco enlaces, número confirmado,
atributos de seguridad de nuevas pestañas y presencia del logo comprobados.
La copia del logo coincide en SHA-256 con el archivo entregado. No se dispone
de navegador conectado para una revisión visual en dispositivos reales.
