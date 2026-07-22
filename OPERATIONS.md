# Biofactor — Guía de operación

Sitio estático servido por Netlify desde la rama `main` de GitHub. Sin paso de
build: Netlify publica los archivos tal cual (ver `netlify.toml`).

---

## 1. Formularios (Contacto y Farmacovigilancia)

Ambos formularios usan **Netlify Forms**. Así funciona:

- Cada página tiene un **formulario oculto estático** (al final del HTML, con
  `data-netlify="true"`). Netlify lo detecta **en cada deploy** y registra el
  formulario. El formulario visible (React) envía por `fetch` a `/`.
- El envío solo muestra "enviado" si Netlify responde `2xx`. Si falla, muestra un
  **error real** con un canal alternativo (nunca un falso éxito).
- Cada envío genera un **ID de referencia** (`BF-…`) que se muestra al usuario y
  se guarda con el envío.

### ⚠️ Paso manual obligatorio: activar los avisos por email

Netlify **guarda** los envíos automáticamente, pero **no envía emails** hasta que
lo configures. Una sola vez, en el panel de Netlify:

1. **Site → Forms** — confirmá que aparecen `contacto` y `farmacovigilancia`
   (aparecen después del primer deploy que incluye los formularios ocultos).
2. Para **cada** formulario: **Settings → Form notifications → Add notification →
   Email notification**.
   - `contacto` → **info@biofactor.com.ar**
   - `farmacovigilancia` → **info@biofactor.com.ar** *(la casilla de
     farmacovigilancia; ver abajo cómo cambiarla)*
3. (Opcional) En el asunto/plantilla del aviso podés incluir el campo `refId`
   para que el ID de referencia aparezca en el email.

Dónde ver los envíos guardados: **Site → Forms → (formulario)**.

### Cómo cambiar la casilla de Farmacovigilancia

Se define en **un solo lugar del código** y **un lugar del panel**:

1. En `farmacovigilancia.html`, arriba del `class Component`, editá:
   ```js
   const PHARMACOVIGILANCE_INBOX = 'info@biofactor.com.ar';
   ```
   (Este valor solo alimenta el texto de respaldo que se le muestra al reportante
   si el envío falla.)
2. En Netlify → Forms → `farmacovigilancia` → Form notifications, cambiá el email
   de destino. **Este segundo paso es el que realmente redirige los avisos.**

### Protección anti-spam

- **Honeypot** activo en ambos formularios (campo oculto `bot-field`); Netlify
  descarta los envíos de bots del lado del servidor.
- Netlify aplica además su filtro de spam (Akismet) automáticamente.
- **reCAPTCHA todavía NO está activado.** Se difirió a propósito: una integración
  de reCAPTCHA mal cargada podría **bloquear un reporte de evento adverso**
  legítimo, y la prioridad #1 es que ningún reporte se pierda. Si aparece spam,
  activarlo es un paso posterior acotado (requiere clave de sitio en el panel de
  Netlify + ajustes de CSP).
- El formulario de Farmacovigilancia **nunca bloquea** un envío por límite de
  frecuencia (a diferencia de Contacto, que mantiene un límite local de 3/hora).

---

## 2. Catálogo de productos (Google Sheets)

- La página `productos.html` y el desplegable de `farmacovigilancia.html` leen los
  productos en vivo desde una **planilla de Google publicada como CSV**.
- La URL del CSV está en `products-data.js` (y el fetch en `productos.html`).
- El cliente edita los productos **directamente en la planilla**; los cambios
  aparecen en el sitio al recargar. No hace falta re-deploy.

---

## 3. Deploy

- `git push` a `main` → Netlify deploya automáticamente.
- Los Pull Requests generan **Deploy Previews** (entorno de prueba).
- Ajustes de Netlify: **Build command** vacío, **Publish directory** = `.`
  (definido en `netlify.toml`).

---

## Pendientes conocidos (fuera de este alcance)

- Dominio `biofactor.com.ar` todavía apunta al sitio anterior; falta apuntar el
  DNS a Netlify.
- reCAPTCHA en Farmacovigilancia (ver arriba).
- Checkbox de consentimiento + política de privacidad en el paso final del
  formulario de Farmacovigilancia (Ley 25.326), y archivado de envíos — Fase de
  cumplimiento posterior.
