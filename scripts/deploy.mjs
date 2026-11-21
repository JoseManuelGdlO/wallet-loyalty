import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readDeployUrl() {
  if (process.env.EASYPANEL_DEPLOY_URL) return process.env.EASYPANEL_DEPLOY_URL.trim();
  const file = resolve(".env");
  if (!existsSync(file)) return "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*EASYPANEL_DEPLOY_URL\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    return match[1].replace(/^['"]|['"]$/g, "");
  }
  return "";
}

const url = readDeployUrl();
if (!url) {
  console.error("Falta EASYPANEL_DEPLOY_URL en .env. Es la Deployment Trigger URL del servicio Compose en EasyPanel.");
  process.exit(1);
}

async function call(method) {
  const response = await fetch(url, { method });
  const body = await response.text();
  return { status: response.status, body };
}

let result = await call("POST");
if (result.status === 404 || result.status === 405) result = await call("GET");
if (result.status < 200 || result.status >= 300) {
  console.error(`EasyPanel respondió ${result.status}.`);
  if (result.body) console.error(result.body.slice(0, 500));
  process.exit(1);
}

console.log("EasyPanel recibió la orden de desplegar. El sitio se actualiza cuando termine la construcción.");
