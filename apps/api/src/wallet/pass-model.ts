import { stampView } from "@intelekia/shared";

export type PassVisual = {
  businessName: string;
  programName: string;
  customerName: string;
  rewardTitle: string;
  rewardDescription?: string | null;
  current: number;
  required: number;
  rewardAvailable: boolean;
  icon: string;
  cycle: number;
  background: string;
  foreground: string;
  label: string;
  scanToken: string;
  serialNumber: string;
  authenticationToken: string;
  passTypeIdentifier: string;
  teamIdentifier: string;
  webServiceURL: string;
  hasLogo?: boolean;
};

export function hexToRgb(hex: string): string {
  const value = hex.replace("#", "");
  const color = value.length === 3
    ? value.split("").map((part) => part + part).join("")
    : value;
  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);
  return `rgb(${red}, ${green}, ${blue})`;
}

export function buildStoreCardPass(input: PassVisual) {
  const stamps = stampView({
    current: input.current,
    required: input.required,
    icon: input.icon,
    rewardAvailable: input.rewardAvailable,
  });
  const remaining = Math.max(input.required - stamps.current, 0);
  const progress = input.rewardAvailable || remaining === 0
    ? `Recompensa lista: ${input.rewardTitle}`
    : remaining === 1
      ? `Te falta 1 sello para ${input.rewardTitle}`
      : `Te faltan ${remaining} sellos para ${input.rewardTitle}`;
  const barcode = {
    message: input.scanToken,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
    altText: "Tarjeta de lealtad",
  };
  return {
    formatVersion: 1,
    passTypeIdentifier: input.passTypeIdentifier,
    serialNumber: input.serialNumber,
    teamIdentifier: input.teamIdentifier,
    webServiceURL: input.webServiceURL,
    authenticationToken: input.authenticationToken,
    organizationName: input.businessName,
    description: `${input.programName} · ${input.businessName}`,
    logoText: input.businessName.slice(0, 30),
    foregroundColor: hexToRgb(input.foreground),
    backgroundColor: hexToRgb(input.background),
    labelColor: hexToRgb(input.label),
    barcode,
    barcodes: [barcode],
    storeCard: {
      secondaryFields: [
        { key: "progress", label: input.programName, value: progress },
      ],
      backFields: [
        { key: "member", label: "Cliente", value: input.customerName },
        {
          key: "how",
          label: "Cómo usarla",
          value: "Muestra el código QR en el negocio. El personal confirma la visita antes de sumar un sello.",
        },
        {
          key: "reward",
          label: "Recompensa",
          value: input.rewardDescription || input.rewardTitle,
        },
        { key: "cycle", label: "Ciclo", value: String(input.cycle) },
      ],
    },
  };
}

export function buildLoyaltyClass(input: {
  id: string;
  issuerName: string;
  programName: string;
  logoUrl: string;
  hexBackground: string;
}) {
  return {
    id: input.id,
    issuerName: input.issuerName,
    reviewStatus: "UNDER_REVIEW",
    programName: input.programName,
    hexBackgroundColor: input.hexBackground,
    programLogo: {
      sourceUri: { uri: input.logoUrl },
      contentDescription: {
        defaultValue: { language: "es", value: input.issuerName },
      },
    },
  };
}

export function buildLoyaltyObject(input: {
  id: string;
  classId: string;
  accountName: string;
  serialNumber: string;
  scanToken: string;
  current: number;
  required: number;
  rewardTitle: string;
  rewardAvailable: boolean;
  icon: string;
  heroUrl?: string;
}) {
  const stamps = stampView({
    current: input.current,
    required: input.required,
    icon: input.icon,
    rewardAvailable: input.rewardAvailable,
  });
  const object: Record<string, unknown> = {
    id: input.id,
    classId: input.classId,
    state: "ACTIVE",
    accountId: input.serialNumber,
    accountName: input.accountName,
    loyaltyPoints: {
      label: "Sellos",
      balance: { int: stamps.current },
    },
    secondaryLoyaltyPoints: {
      label: "Meta",
      balance: { int: stamps.required },
    },
    barcode: {
      type: "QR_CODE",
      value: input.scanToken,
      alternateText: "Muestra este código",
    },
    textModulesData: [
      { id: "progress", header: "Progreso", body: stamps.label },
      {
        id: "reward",
        header: "Recompensa",
        body: input.rewardAvailable ? `Lista: ${input.rewardTitle}` : input.rewardTitle,
      },
    ],
  };
  if (input.heroUrl) {
    object.heroImage = {
      sourceUri: { uri: input.heroUrl },
      contentDescription: {
        defaultValue: { language: "es", value: "Sellos acumulados" },
      },
    };
  }
  return object;
}
