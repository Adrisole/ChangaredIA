# 🚀 Guía de Despliegue en Hostinger para Changared (Node.js)

Esta guía explica paso a paso cómo subir y poner en producción **Changared** en tu cuenta de Hostinger.

---

## 📋 Preparativos: Subir el código a GitHub

El repositorio local ya está configurado con tu remote `https://github.com/Adrisole/ChangaredIA.git`.

Ejecuta en tu terminal local:
```bash
git add .
git commit -m "feat: changared production ready with multi-tenant, i18n, billing and hostinger configs"
git push origin main
```

---

## OPCIÓN A: Si tienes Hostinger Web Hosting o Cloud Hosting (hPanel)

Hostinger incluye el gestor de aplicaciones Node.js directamente en el panel de control.

### Paso 1: Clonar el proyecto desde Git
1. Ingresa a tu panel de **Hostinger (hPanel)**.
2. Ve a la sección **Avanzado > Git**.
3. En **Crear un nuevo repositorio Git**:
   - URL del repositorio: `https://github.com/Adrisole/ChangaredIA.git`
   - Rama: `main`
   - Directorio de destino: `/public_html` (o una subcarpeta como `/changared`)
4. Haz clic en **Crear** y luego en **Desplegar (Deploy)**.

### Paso 2: Configurar Node.js en hPanel
1. En el buscador de hPanel, escribe y selecciona **Node.js**.
2. Configura los siguientes campos:
   - **Versión de Node.js:** Selecciona `v18.x` o `v20.x` (LTS recomendado).
   - **Modo de la aplicación:** `Production`.
   - **Raíz de la aplicación (Application Root):** `/public_html` (o la ruta donde clonaste).
   - **Archivo de inicio (Application startup file):** `server.js`
3. Haz clic en **Crear**.

### Paso 3: Instalar dependencias (.env y npm install)
1. En la misma pantalla de Node.js, busca el botón **Instalar dependencias de npm (npm install)** y ejecútalo.
2. Abre el **Administrador de Archivos** de Hostinger en la carpeta del proyecto:
   - Crea un archivo `.env` (o edita el existente) con tus valores de producción:
     ```env
     PORT=3000
     NODE_ENV=production
     OPENAI_API_KEY=tu_api_key_real
     OPENAI_MODEL=gpt-4o-mini
     WHATSAPP_VERIFY_TOKEN=<guardado solo en Hostinger>
     DATA_STORAGE_PATH=./src/data/businesses.json
     MONGODB_URI=mongodb+srv://<usuario>:<password>@cluster0.xxxxx.mongodb.net/changared?retryWrites=true&w=majority
     ```
   - *Nota:* Al configurar `MONGODB_URI`, Changared migrará y sincronizará automáticamente todos los negocios, usuarios, sesiones y turnos existentes desde los archivos JSON hacia MongoDB.
3. Vuelve a la pantalla de Node.js y haz clic en **Reiniciar aplicación (Restart Application)**.
4. ¡Listo! Al ingresar a tu dominio, verás el panel de Changared activo.

---

## OPCIÓN B: Si tienes Hostinger VPS (Servidor Virtual Privado)

El VPS es la opción más potente y recomendada para microservicios con webhooks activos 24/7.

### Paso 1: Conectarte por SSH
```bash
ssh root@IP_DE_TU_VPS
```

### Paso 2: Instalar Node.js y PM2 (si aún no los tienes)
```bash
# Actualizar sistema e instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Instalar PM2 para mantener la app viva 24/7
sudo npm install -g pm2
```

### Paso 3: Clonar y configurar Changared
```bash
# Clonar en /var/www/
cd /var/www/
git clone https://github.com/Adrisole/ChangaredIA.git
cd ChangaredIA

# Instalar dependencias
npm install --production

# Crear archivo de entorno
cp .env.example .env
nano .env  # (Pega tu OPENAI_API_KEY y guarda con Ctrl+O, Enter, Ctrl+X)
```

### Paso 4: Iniciar con PM2
El proyecto ya cuenta con el archivo `ecosystem.config.cjs` preconfigurado:
```bash
# Iniciar la aplicación
pm2 start ecosystem.config.cjs

# Configurar para que inicie automáticamente si se reinicia el servidor
pm2 save
pm2 startup
```

### Paso 5: Configurar Nginx (Reverse Proxy y Dominio con SSL)
Crea la configuración de Nginx:
```bash
sudo nano /etc/nginx/sites-available/changared
```
Pega lo siguiente (reemplazando `tudominio.com` por el tuyo):
```nginx
server {
    listen 80;
    server_name tudominio.com api.tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Activa el sitio y recarga Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/changared /etc/nginx/sites-enabled/
sudo systemctl reload nginx

# Instalar certificado SSL gratuito (HTTPS) con Certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tudominio.com
```

---

## 📡 Configuración Final de Webhooks en Producción

Una vez que tu dominio esté activo en Hostinger (por ejemplo `https://changared.com`):

1. **Meta WhatsApp Cloud API:**
   - Callback URL: `https://changared.com/api/webhook/{businessId}`
   - Verify Token: `WHATSAPP_VERIFY_TOKEN=<guardado solo en Hostinger>`

2. **Lemon Squeezy (Facturación en USD):**
   - Webhook URL: `https://changared.com/api/billing/webhook/lemonsqueezy`
   - Eventos: `subscription_created`, `subscription_payment_success`, `subscription_updated`.

3. **Mercado Pago (Facturación en ARS):**
   - Webhook URL: `https://changared.com/api/billing/webhook/mercadopago`

---

## Variables de pagos (Mercado Pago LATAM, Wise, Payoneer)

El bloque "PAGOS Y COBROS DE SUSCRIPCIONES" de `.env.example` ya esta armado con todas las claves **vacias**. Copialo a tu `.env` de Hostinger (hPanel > Node.js > Environment variables, o `nano .env` en VPS) y completa solo lo que uses:

| Variable | Donde se obtiene |
|---|---|
| `PUBLIC_BASE_URL` | Tu dominio HTTPS final, ej. `https://app.tudominio.com` (sin barra final) |
| `BILLING_ADMIN_KEY` | Generala: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `MP_ACCESS_TOKEN_<PAIS>` | Mercado Pago Developers > Tu app > Credenciales de **produccion** (una app por pais: AR, BR, MX, CL, CO, PE, UY) |
| `MP_WEBHOOK_SECRET_<PAIS>` | Tu app > Webhooks > Clave secreta |
| `MP_FX_<MONEDA>` | Pesos locales por 1 USD (BRL, MXN, CLP, COP, PEN, UYU). No aplica a AR |
| `WISE_PAYMENT_LINK` / `WISE_EMAIL` / `WISE_USD_ACCOUNT_DETAILS` / `WISE_ACCOUNT_HOLDER` | Wise > Recibir |
| `PAYONEER_PAYMENT_LINK` / `PAYONEER_EMAIL` / `PAYONEER_ACCOUNT_HOLDER` | Payoneer > Recibir |

Notas:
- Un pais de Mercado Pago queda habilitado en el panel solo si tiene token (y `MP_FX_*` fuera de AR). Wise/Payoneer, si tienen al menos un dato de cobro.
- Registra en cada app de Mercado Pago el webhook `https://TU_DOMINIO/api/billing/webhook/mercadopago?country=<PAIS>` (evento "Pagos").
- Tras editar el `.env` reinicia la app (`pm2 restart changared` o "Restart" en hPanel).
- Nunca subas el `.env` a Git (ya esta en `.gitignore`) ni compartas los tokens.
- Verifica lo habilitado en `GET /api/billing/plans` (no expone secretos).
