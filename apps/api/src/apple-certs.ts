import fs from "fs";
import path from "path";

const specs = [
  ["APPLE_WWDR_CERT_BASE64", "APPLE_WWDR_CERT_PATH", "wwdr.pem"],
  ["APPLE_SIGNER_CERT_BASE64", "APPLE_SIGNER_CERT_PATH", "signerCert.pem"],
  ["APPLE_SIGNER_KEY_BASE64", "APPLE_SIGNER_KEY_PATH", "signerKey.pem"],
] as const;

export function materializeAppleCerts() {
  const dir = "/tmp/apple-certs";
  for (const [encodedName, pathName, fileName] of specs) {
    const configured = process.env[pathName];
    if (configured && fs.existsSync(configured)) continue;
    const encoded = (process.env[encodedName] || "").replace(/\s/g, "");
    if (!encoded) continue;
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, fileName);
    fs.writeFileSync(target, Buffer.from(encoded, "base64"));
    process.env[pathName] = target;
  }
}
