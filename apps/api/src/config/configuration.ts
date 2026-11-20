export type AppConfig = {
  nodeEnv: string;
  port: number;
  webOrigins: string[];
  publicBaseUrl: string;
  publicWebUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  encryptionKey: Buffer;
  uploadDir: string;
  apple: {
    passTypeIdentifier: string;
    teamIdentifier: string;
    wwdrPath: string;
    signerCertPath: string;
    signerKeyPath: string;
    signerKeyPassphrase: string;
    webServiceUrl: string;
    configured: boolean;
  };
  google: {
    issuerId: string;
    serviceAccountFile: string;
    clientEmail: string;
    privateKey: string;
    origins: string[];
    logoUrl: string;
    configured: boolean;
  };
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Falta la variable ${name}`);
  }
  return value;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const key = Buffer.from(required(env, "APP_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY debe decodificar a 32 bytes");
  }

  const publicBaseUrl = (env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const publicWebUrl = (env.PUBLIC_WEB_URL || "http://localhost:5173").replace(/\/$/, "");
  const googleKey = (env.GOOGLE_WALLET_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const appleConfigured = Boolean(
    env.APPLE_PASS_TYPE_IDENTIFIER &&
      env.APPLE_TEAM_IDENTIFIER &&
      env.APPLE_WWDR_CERT_PATH &&
      env.APPLE_SIGNER_CERT_PATH &&
      env.APPLE_SIGNER_KEY_PATH,
  );
  const googleConfigured = Boolean(
    env.GOOGLE_WALLET_ISSUER_ID &&
      (env.GOOGLE_WALLET_SERVICE_ACCOUNT_FILE || (env.GOOGLE_WALLET_CLIENT_EMAIL && googleKey)),
  );

  return {
    nodeEnv: env.NODE_ENV || "development",
    port: Number(env.PORT || 3000),
    webOrigins: (env.WEB_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    publicBaseUrl,
    publicWebUrl,
    jwtAccessSecret: required(env, "JWT_ACCESS_SECRET"),
    jwtRefreshSecret: required(env, "JWT_REFRESH_SECRET"),
    jwtAccessTtl: env.JWT_ACCESS_TTL || "15m",
    jwtRefreshTtl: env.JWT_REFRESH_TTL || "7d",
    encryptionKey: key,
    uploadDir: env.UPLOAD_DIR || "uploads",
    apple: {
      passTypeIdentifier: env.APPLE_PASS_TYPE_IDENTIFIER || "",
      teamIdentifier: env.APPLE_TEAM_IDENTIFIER || "",
      wwdrPath: env.APPLE_WWDR_CERT_PATH || "",
      signerCertPath: env.APPLE_SIGNER_CERT_PATH || "",
      signerKeyPath: env.APPLE_SIGNER_KEY_PATH || "",
      signerKeyPassphrase: env.APPLE_SIGNER_KEY_PASSPHRASE || "",
      webServiceUrl: (env.APPLE_WEB_SERVICE_URL || `${publicBaseUrl}/api/wallet/apple`).replace(/\/$/, ""),
      configured: appleConfigured,
    },
    google: {
      issuerId: env.GOOGLE_WALLET_ISSUER_ID || "",
      serviceAccountFile: env.GOOGLE_WALLET_SERVICE_ACCOUNT_FILE || "",
      clientEmail: env.GOOGLE_WALLET_CLIENT_EMAIL || "",
      privateKey: googleKey,
      origins: (env.GOOGLE_WALLET_ORIGINS || publicWebUrl)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      logoUrl: env.GOOGLE_WALLET_LOGO_URL || "",
      configured: googleConfigured,
    },
  };
}
