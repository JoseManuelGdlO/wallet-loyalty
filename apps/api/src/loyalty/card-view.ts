import { stampView } from "@intelekia/shared";
import type { Customer, LoyaltyCard, LoyaltyProgram, WalletPass } from "@prisma/client";

export function presentCard(
  card: LoyaltyCard & {
    program: LoyaltyProgram;
    customer: Customer;
    walletPasses?: WalletPass[];
  },
  options?: { includeContact?: boolean },
) {
  const stamps = stampView({
    current: card.currentStamps,
    required: card.program.stampsRequired,
    icon: card.program.stampIcon,
    rewardAvailable: card.rewardAvailable,
  });
  return {
    id: card.id,
    customerId: card.customerId,
    customerName: card.customer.name,
    email: options?.includeContact ? card.customer.email : undefined,
    phone: options?.includeContact ? card.customer.phone : undefined,
    programId: card.programId,
    programName: card.program.name,
    rewardTitle: card.program.rewardTitle,
    rewardDescription: card.program.rewardDescription,
    stampIcon: card.program.stampIcon,
    colors: {
      background: card.program.cardBackground,
      foreground: card.program.cardForeground,
      label: card.program.cardLabel,
    },
    currentStamps: card.currentStamps,
    stampsRequired: card.program.stampsRequired,
    rewardAvailable: card.rewardAvailable,
    cycle: card.cycle,
    status: card.status,
    version: card.version,
    lastStampAt: card.lastStampAt,
    stamps,
    wallet: {
      apple: Boolean(card.walletPasses?.some((pass) => pass.provider === "APPLE")),
      google: Boolean(card.walletPasses?.some((pass) => pass.provider === "GOOGLE" && pass.googleObjectId)),
    },
  };
}

export function maskContact(value: string | null, reveal: boolean) {
  if (!value) return null;
  if (reveal) return value;
  if (value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 1)}•••@${domain}`;
  }
  return `•••${value.slice(-4)}`;
}
