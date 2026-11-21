# Despliegue en EasyPanel

El `docker-compose.yml` de la raíz levanta PostgreSQL, el API y el frontend. En un VPS con EasyPanel puedes usar ese compose o crear tres servicios equivalentes.

## Variables

Usa `docker/compose.env.example` como lista. En EasyPanel pégalas en el entorno del proyecto Compose. No reutilices el `.env` de desarrollo: ese apunta el panel a `localhost:5173`, y Compose lo ignora a propósito para las direcciones públicas.

Genera la clave de cifrado con 32 bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

En producción define al menos:

```text
POSTGRES_PASSWORD=una-clave-solo-letras-y-numeros
DOCKER_WEB_ORIGIN=https://loyalty.intelekia.cloud
DOCKER_PUBLIC_BASE_URL=https://loyalty.intelekia.cloud
DOCKER_PUBLIC_WEB_URL=https://loyalty.intelekia.cloud
DOCKER_APPLE_WEB_SERVICE_URL=https://loyalty.intelekia.cloud/api/wallet/apple
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
APP_ENCRYPTION_KEY=
APPLE_PASS_TYPE_IDENTIFIER=pass.com.intelekia.loyalty
APPLE_TEAM_IDENTIFIER=
```

Compose arma `DATABASE_URL` hacia el servicio `postgres`. Las tres direcciones `DOCKER_*` tienen que ser el dominio público con HTTPS. Apple no actualiza pases contra localhost.

No subas `.env`, certificados `.pem`, `.p12`, `.p8` ni el JSON de la cuenta de servicio. En el servidor, copia estos archivos a `docker/certs/` antes de levantar el stack:

```text
docker/certs/wwdr.pem
docker/certs/signerCert.pem
docker/certs/signerKey.pem
```

El contenedor los lee en `/certs`. Si esa carpeta está vacía, el sello se guarda y Wallet responde que no está configurado.

## EasyPanel

1. Crea un proyecto y conecta el repositorio.
2. Agrega un servicio Compose apuntando a `docker-compose.yml`, o tres servicios:
   - Postgres 16, con volumen persistente.
   - API, Dockerfile `docker/api.Dockerfile`, puerto 3000, volumen para `/app/apps/api/uploads`.
   - Web, Dockerfile `docker/web.Dockerfile`, puerto 80.
3. El contenedor del API ejecuta `prisma migrate deploy` al arrancar.
4. En el proxy de EasyPanel publica solo el servicio `web`, puerto 80. Nginx reenvía `/api` al contenedor `api` y conserva el HTTPS del proxy.
5. Comprueba `https://tu-dominio/api/health`. Debe responder `{ "status": "ok" }`.
6. Postgres no publica puertos en el servidor. La API se conecta por el nombre `postgres` dentro de la red de Compose. El sitio entra solo por el dominio, hacia el puerto 80 del servicio `web`.

El disco de `uploads` sirve logos de un solo nodo. Si más adelante hay varias réplicas, mueve las imágenes a un almacén de objetos.

## Desplegar sin abrir EasyPanel

Cada push a `main` llama a la URL de disparo del servicio Compose. Esa URL está en el servicio, pestaña **Deployments**, como **Deployment Trigger URL**. Cópiala una vez y guárdala como secreto del repositorio:

```bash
gh secret set EASYPANEL_DEPLOY_URL
```

Pega la URL cuando lo pida y pulsa Enter. A partir de ahí, un push a `main` redespliega el sitio. Desde esta carpeta también puedes lanzarlo con `npm run deploy` si la misma URL está en `.env` como `EASYPANEL_DEPLOY_URL`.

## Después del primer arranque

Entra al contenedor del API y ejecuta el seed solo en un entorno de demostración:

```bash
npm run prisma:seed -w @intelekia/api
```

En producción crea el negocio desde el superadministrador. No dejes las contraseñas del seed.
