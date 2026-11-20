# Intelekia Loyalty — Arquitectura

Plataforma SaaS multiempresa de tarjetas de lealtad digitales. El cliente acumula sellos, agrega la tarjeta a Apple Wallet o Google Wallet y, cuando un empleado confirma una visita, el saldo se actualiza en la base de datos y se empuja al pase ya instalado.

Este documento fija las decisiones con las que se construye el monorepo. No sustituye la configuración de certificados: sin credenciales reales de Apple y Google el flujo web, el escáner y los sellos funcionan; la instalación en Wallet no se considera verificada.

## Contexto

El repositorio de trabajo estaba vacío. El monorepo vive en la raíz del proyecto.

```text
apps/web      React + TypeScript + Vite + Tailwind + componentes shadcn/ui
apps/api      NestJS + Prisma + PostgreSQL
packages/shared  Tipos y reglas de presentación de sellos compartidas
docker        Imágenes y nginx
docs          Arquitectura, Wallet y EasyPanel
```

## Decisiones

### Multi-tenant

`Tenant` es la cuenta SaaS (plan y estado). `Business` es la marca pública (slug, colores, logo). En la operación habitual hay un negocio por cuenta; el esquema permite varios.

Toda fila operativa lleva `tenantId`. Las de negocio llevan también `businessId`.

- `SUPER_ADMIN` no tiene tenant y puede cruzar cuentas.
- `BUSINESS_ADMIN` y `EMPLOYEE` quedan fijados a un `tenantId` y un `businessId` en el JWT. Cada consulta y cada escritura vuelven a comprobar ese alcance contra la fila, no solo contra el cuerpo de la petición.
- `CUSTOMER` existe en el catálogo de roles y no puede llamar a sellos, canjes ni administración. El cliente no tiene contraseña: entra a su tarjeta con un token opaco de un solo propósito.

Un identificador de otra cuenta responde 403. Un QR de otra cuenta, buscado por un empleado, responde 404 para no confirmar que el código existe.

### El QR no es una credencial de empleado

El código QR contiene solo un token opaco (`ilk_` + 32 bytes). En base de datos se guarda el SHA-256 para buscarlo y una copia cifrada con AES-256-GCM para poder reconstruir el pase. No se guarda el id interno en el QR.

Registrar un sello exige, a la vez:

1. Sesión de `EMPLOYEE`, `BUSINESS_ADMIN` o `SUPER_ADMIN`.
2. El token del QR, vuelto a comprobar dentro de la transacción.
3. Confirmación en la interfaz (el escáner no escribe al detectar).
4. `Idempotency-Key`.
5. La tarjeta y el programa activos, dentro de vigencia, bajo el tope diario y el tiempo mínimo entre sellos.

Si el correo del empleado coincide con el del cliente, la operación se rechaza.

### Sellos y ciclos

La tarjeta guarda `currentStamps`, `cycle`, `rewardAvailable` y `lockVersion`.

Al llegar a la meta, el saldo se queda en la meta y `rewardAvailable` pasa a verdadero. No se acumulan sellos extra mientras la recompensa siga pendiente (`blockWhenRewardAvailable`, activo por defecto).

El canje lo hace un empleado o un administrador, guarda recompensa, ciclo, sucursal y responsable, pone el saldo en cero e incrementa el ciclo. La misma tarjeta sigue vigente: Apple no permite cambiar el número de serie ni el `authenticationToken`, así que un ciclo nuevo no es un pase nuevo.

La reversión de un sello la hace solo un administrador, no el empleado que escanea. Se rechaza si ese ciclo ya se canjeó. La reversión es otra transacción, no un borrado.

Concurrencia: `SELECT … FOR UPDATE` sobre la tarjeta y, además, `updateMany` condicionado al saldo leído. La clave de idempotencia es única por negocio. Una repetición de la misma clave devuelve el resultado original.

### Wallet, sin simulación

Apple Wallet no ejecuta HTML. El pase es un `storeCard` firmado (PassKit): campos de texto, código QR y una imagen de tira generada en el servidor con los sellos dibujados. El emoji elegido por el negocio se usa en la web; en el `.pkpass` se dibuja un glifo (taza, estrella, corazón o punto) porque el render del servidor no depende de fuentes de emoji.

El servicio web sigue la guía de Apple “Adding a Web Service to Update Passes”:

| Método | Ruta bajo `{webServiceURL}` | Autenticación |
| --- | --- | --- |
| POST | `/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}` | `Authorization: ApplePass {authenticationToken}` |
| DELETE | la misma ruta | `ApplePass` |
| GET | `/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}` | identificador de dispositivo |
| GET | `/v1/passes/{passTypeIdentifier}/{serialNumber}` | `ApplePass` |
| POST | `/v1/log` | ninguna |

`webServiceURL` queda en `{PUBLIC_BASE_URL}/api/wallet/apple`.

Al registrar un sello la transacción confirma el saldo y sube `version`. Después del commit, si hay dispositivos y certificado del Pass Type ID, se envía a APNs producción (`api.push.apple.com`) un JSON vacío `{}` con `apns-topic` igual al pass type identifier, usando el mismo certificado que firma el pase. Apple documenta que el push de pases solo funciona en producción. Un token inválido (410 / BadDeviceToken) elimina el registro.

Google Wallet usa la API oficial de loyalty:

- `POST https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass`
- `POST` / `PATCH https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/{id}`
- Enlace “Add to Google Wallet”: JWT `typ=savetowallet` firmado con la cuenta de servicio, abierto en `https://pay.google.com/gp/v/save/{jwt}`

La clase usa `reviewStatus: UNDER_REVIEW` hasta que Google la apruebe. El logo tiene que ser una URL HTTPS pública; si no hay URL pública, la emisión responde que falta configuración en lugar de inventar un enlace.

La respuesta de un sello informa el estado real de cada wallet: `not_configured`, `no_devices`, `not_issued`, `pushed`, `updated` o `failed`. Modificar PostgreSQL no se reporta como actualización de Wallet.

### Autenticación del personal

JWT de acceso (15 minutos) en memoria del navegador y refresh opaco en cookie `httpOnly`, rotada en cada uso. Si se presenta un refresh ya revocado, se invalidan todas las sesiones de ese usuario. El personal no se guarda solo en `localStorage`.

### Registro público

`POST /api/customers/register` no pide contraseña. Exige nombre y al menos correo o teléfono, un campo señuelo vacío y un tiempo mínimo de formulario. El correo y el teléfono son únicos por negocio. Hay límite de peticiones y el tope de clientes del plan.

### Imágenes

Los archivos se reescriben con `sharp` a PNG y se sirven desde el disco del nodo (`/api/uploads`). Encaja con un VPS de un solo nodo (EasyPanel). No hay certificados ni claves en el repositorio.

## Módulos del API

- `auth` — login, refresh, logout.
- `businesses` — cuentas, sucursales, empleados, planes.
- `loyalty` — programas, clientes, tarjetas, sellos, canjes, página pública.
- `wallet` — PassKit, servicio web Apple, APNs, Google Wallet, arte de sellos.
- `analytics` — indicadores del panel.
- `audit` — bitácora de sellos, canjes, reversiones y wallet.

## Qué queda fuera de esta versión

Cobro real de suscripciones, envío de correo y un almacén de objetos externo. El plan comercial se configura y se hace cumplir el cupo; no hay pasarela de pago.
