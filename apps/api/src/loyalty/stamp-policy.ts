export type StampDecision =
  | { ok: true; nextStamps: number; rewardUnlocked: boolean }
  | { ok: false; code: string; message: string };

export function evaluateStamp(input: {
  currentStamps: number;
  stampsRequired: number;
  rewardAvailable: boolean;
  blockWhenRewardAvailable: boolean;
  earnedToday: number;
  maxStampsPerDay: number;
  lastStampAt: Date | null;
  now: Date;
  cooldownSeconds: number;
  cardActive: boolean;
  programActive: boolean;
  selfScan: boolean;
}): StampDecision {
  if (input.selfScan) {
    return {
      ok: false,
      code: "SELF_SCAN",
      message: "No puedes registrar un sello en tu propia tarjeta.",
    };
  }
  if (!input.cardActive) {
    return { ok: false, code: "CARD_INACTIVE", message: "La tarjeta no está activa." };
  }
  if (!input.programActive) {
    return { ok: false, code: "PROGRAM_INACTIVE", message: "El programa no está vigente." };
  }
  if (input.rewardAvailable && input.blockWhenRewardAvailable) {
    return {
      ok: false,
      code: "REWARD_PENDING",
      message: "La recompensa está lista. Canjéala antes de sumar otro sello.",
    };
  }
  if (input.currentStamps >= input.stampsRequired) {
    return {
      ok: false,
      code: "ALREADY_COMPLETE",
      message: "Esta tarjeta ya completó los sellos del ciclo.",
    };
  }
  if (input.earnedToday >= input.maxStampsPerDay) {
    return {
      ok: false,
      code: "DAILY_LIMIT",
      message: "Esta tarjeta alcanzó el máximo de sellos de hoy.",
    };
  }
  if (input.lastStampAt && input.cooldownSeconds > 0) {
    const elapsed = (input.now.getTime() - input.lastStampAt.getTime()) / 1000;
    if (elapsed < input.cooldownSeconds) {
      return {
        ok: false,
        code: "COOLDOWN",
        message: "Espera un momento antes de registrar otro sello en esta tarjeta.",
      };
    }
  }
  const nextStamps = input.currentStamps + 1;
  return {
    ok: true,
    nextStamps,
    rewardUnlocked: nextStamps >= input.stampsRequired,
  };
}

export function startOfZonedDay(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"), pick("second"));
  const offset = asUtc - now.getTime();
  return new Date(Date.UTC(pick("year"), pick("month") - 1, pick("day"), 0, 0, 0) - offset);
}
