# Intelekia Loyalty

Tarjetas de lealtad digitales para varios negocios. El cliente se registra sin contraseña, guarda la tarjeta en la web y, cuando hay certificados, en Apple Wallet o Google Wallet. El empleado confirma el sello; el saldo no cambia solo por leer el QR.

## Qué incluye

- API NestJS, PostgreSQL y Prisma, con JWT, refresh en cookie httpOnly y aislamiento por negocio.
- Panel en español: indicadores, negocios, programas, clientes, escáner y canjes.
- Registro público en `/c/:slug` y tarjeta en `/t/:token`.
- PassKit (`.pkpass`, servicio web de Apple y APNs) y Google Wallet API. Sin credenciales no se simula que el pase se actualizó.
- Docker Compose para un VPS con EasyPanel.

La arquitectura está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Los certificados, en [docs/WALLET-SETUP.md](docs/WALLET-SETUP.md). El despliegue, en [docs/DEPLOY-EASYPANEL.md](docs/DEPLOY-EASYPANEL.md).

## Arranque local

Requiere Node.js 22 o superior y Docker.

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run prisma:deploy -w @intelekia/api
npm run build -w @intelekia/shared
npm run prisma:seed -w @intelekia/api
npm run dev
```

- Panel: http://localhost:5173
- API: http://localhost:3000/api/health
- OpenAPI: http://localhost:3000/api/docs
- Registro de la cafetería de demostración: http://localhost:5173/c/cafeteria-demo

El seed imprime las URLs de dos tarjetas de ejemplo y las guarda en `apps/api/.demo-cards.json`.

Accesos solo para desarrollo:

| Correo | Contraseña | Rol |
| --- | --- | --- |
| super@intelekia.test | Demo1234! | Superadministrador |
| ana.admin@cafeteria-demo.test | Demo1234! | Administradora |
| luis.empleado@cafeteria-demo.test | Demo1234! | Empleado |

Desde otro teléfono en la misma red abre el panel con la IP de esta máquina, puerto 5173. El escáner también acepta pegar el código si la cámara no está disponible. Registrar un sello siempre pide confirmación.

## Docker Compose

El archivo `docker-compose.yml` levanta Postgres, la API y el sitio. En esta máquina:

```bash
docker compose up -d --build
```

El sitio queda en http://localhost:8080. Para el VPS, define las variables de `docker/compose.env.example` en EasyPanel y copia los tres PEM a `docker/certs/`. La guía está en [docs/DEPLOY-EASYPANEL.md](docs/DEPLOY-EASYPANEL.md).

## Pruebas

```bash
npm test -w @intelekia/api
npm run test:e2e -w @intelekia/api
```

Las pruebas de integración usan la base `loyalty_test` y cubren registro, duplicados, sellos, idempotencia, aislamiento entre negocios, canje, reversión, concurrencia y el rechazo de un pase Apple sin certificados.

## Wallet

Cuando configures los secretos de [docs/WALLET-SETUP.md](docs/WALLET-SETUP.md), el mismo sello sube la versión del pase, avisa a los iPhone registrados por APNs y actualiza el objeto de Google Wallet. Hasta entonces la tarjeta web sí refleja el sello y la respuesta indica `not_configured`. No se verificó la instalación en dispositivos reales.
