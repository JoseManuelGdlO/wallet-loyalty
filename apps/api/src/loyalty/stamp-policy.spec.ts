import { evaluateStamp } from "./stamp-policy";

const base = {
  currentStamps: 3,
  stampsRequired: 10,
  rewardAvailable: false,
  blockWhenRewardAvailable: true,
  earnedToday: 0,
  maxStampsPerDay: 5,
  lastStampAt: null as Date | null,
  now: new Date("2026-11-19T18:00:00.000Z"),
  cooldownSeconds: 90,
  cardActive: true,
  programActive: true,
  selfScan: false,
};

describe("evaluateStamp", () => {
  it("suma un sello y abre la recompensa al llegar a la meta", () => {
    const step = evaluateStamp({ ...base, currentStamps: 9 });
    expect(step).toEqual({ ok: true, nextStamps: 10, rewardUnlocked: true });
  });

  it("bloquea el doble escaneo dentro del tiempo mínimo", () => {
    const decision = evaluateStamp({
      ...base,
      lastStampAt: new Date("2026-11-19T17:59:30.000Z"),
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("COOLDOWN");
  });

  it("respeta el máximo diario y la recompensa pendiente", () => {
    expect(evaluateStamp({ ...base, earnedToday: 5 }).ok).toBe(false);
    const pending = evaluateStamp({ ...base, rewardAvailable: true, currentStamps: 10 });
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.code).toBe("REWARD_PENDING");
  });

  it("impide que el cliente selle su propia tarjeta", () => {
    const decision = evaluateStamp({ ...base, selfScan: true });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("SELF_SCAN");
  });
});
