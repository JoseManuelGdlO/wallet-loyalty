# Configuración de Apple Wallet y Google Wallet

El código firma pases, atiende el servicio web de Apple y actualiza objetos de Google Wallet. Sin credenciales el sello se guarda y la tarjeta web cambia, pero la respuesta dice `not_configured`. Eso no es una actualización de Wallet.

No se probó la instalación en un iPhone ni en un Android en este entorno. Hace falta una cuenta de Apple Developer, un issuer de Google Wallet aprobado, HTTPS público y un dispositivo real.

## Apple

1. En Apple Developer crea un Pass Type ID, por ejemplo `pass.com.intelekia.loyalty`.
2. Crea el certificado del Pass Type ID y exporta el certificado y la clave privada en PEM.
3. Descarga el certificado WWDR vigente (G4) desde [Apple PKI](https://www.apple.com/certificateauthority/) y conviértelo a PEM:

```bash
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
```

4. Define en el entorno, fuera del repositorio:

```text
APPLE_PASS_TYPE_IDENTIFIER=pass.com.intelekia.loyalty
APPLE_TEAM_IDENTIFIER=TU_TEAM_ID
APPLE_WWDR_CERT_PATH=/ruta/wwdr.pem
APPLE_SIGNER_CERT_PATH=/ruta/signerCert.pem
APPLE_SIGNER_KEY_PATH=/ruta/signerKey.pem
APPLE_SIGNER_KEY_PASSPHRASE=
APPLE_WEB_SERVICE_URL=https://tu-dominio/api/wallet/apple
```

En EasyPanel no subas los `.pem` al repositorio. Codifica cada archivo en Base64 y pégalo en `APPLE_WWDR_CERT_BASE64`, `APPLE_SIGNER_CERT_BASE64` y `APPLE_SIGNER_KEY_BASE64`. Al arrancar, la API los escribe en un directorio temporal si `/certs` está vacío.

`APPLE_WEB_SERVICE_URL` tiene que ser HTTPS en producción. Apple llama estas rutas, documentadas en “Adding a Web Service to Update Passes”:

- `POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}`
- `DELETE` de esa misma ruta
- `GET /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}`
- `GET /v1/passes/{passTypeIdentifier}/{serialNumber}`
- `POST /v1/log`

El aviso de actualización sale a `https://api.push.apple.com` con el mismo certificado del Pass Type ID, el topic igual al pass type identifier y el cuerpo `{}`. Apple indica que ese push solo funciona en el entorno de producción.

El pase es un `storeCard`. No lleva HTML. Los sellos van en campos de texto y en una imagen de tira generada en el servidor. El número de serie y el `authenticationToken` no cambian entre actualizaciones.

## Google

1. En Google Wallet Console crea un issuer y una cuenta de servicio con el rol de Wallet.
2. La clase se crea con `reviewStatus: UNDER_REVIEW` mediante `POST https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass`. Google tiene que aprobarla antes de que el público pueda guardarla.
3. Cada tarjeta es un `loyaltyObject`. Al sumar un sello se hace `PATCH` sobre ese objeto. El enlace de instalación es un JWT `savetowallet` abierto en `https://pay.google.com/gp/v/save/{jwt}`.

```text
GOOGLE_WALLET_ISSUER_ID=3388...
GOOGLE_WALLET_SERVICE_ACCOUNT_FILE=/ruta/cuenta.json
GOOGLE_WALLET_ORIGINS=https://tu-dominio
GOOGLE_WALLET_LOGO_URL=https://tu-dominio/logo.png
PUBLIC_BASE_URL=https://tu-dominio
```

El logotipo y la imagen de sellos tienen que ser HTTPS públicos. En local, con `http://localhost`, la API no inventa el enlace: responde que falta esa URL.

También puedes usar `GOOGLE_WALLET_CLIENT_EMAIL` y `GOOGLE_WALLET_PRIVATE_KEY` en lugar del archivo. La clave privada no va en el repositorio.
