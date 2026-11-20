export const ROLE_CODES = [
  "SUPER_ADMIN",
  "BUSINESS_ADMIN",
  "EMPLOYEE",
  "CUSTOMER",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export type WalletSyncState =
  | "not_configured"
  | "no_devices"
  | "not_issued"
  | "pushed"
  | "updated"
  | "failed";

export interface StampView {
  current: number;
  required: number;
  icon: string;
  rewardAvailable: boolean;
  label: string;
  slots: boolean[];
}

export function describeStamps(
  current: number,
  required: number,
  rewardAvailable: boolean,
): string {
  if (rewardAvailable) {
    return `Recompensa lista · ${current} de ${required}`;
  }
  return `${current} de ${required} sellos`;
}

export function stampView(input: {
  current: number;
  required: number;
  icon: string;
  rewardAvailable: boolean;
}): StampView {
  const required = Math.max(1, input.required);
  const current = Math.min(Math.max(0, input.current), required);
  return {
    current,
    required,
    icon: input.icon || "●",
    rewardAvailable: input.rewardAvailable,
    label: describeStamps(current, required, input.rewardAvailable),
    slots: Array.from({ length: required }, (_, index) => index < current),
  };
}
