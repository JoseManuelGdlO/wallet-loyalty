import { Injectable } from "@nestjs/common";
import { scopeFor, type AuthUser } from "../common/access";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: AuthUser, fromInput?: string, toInput?: string, businessId?: string) {
    const to = toInput ? new Date(toInput) : new Date();
    let from = fromInput ? new Date(fromInput) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (to.getTime() - from.getTime() > 120 * 24 * 60 * 60 * 1000) {
      from = new Date(to.getTime() - 120 * 24 * 60 * 60 * 1000);
    }
    const scope = {
      ...scopeFor(user),
      ...(user.role === "SUPER_ADMIN" && businessId ? { businessId } : {}),
    };
    const period = { createdAt: { gte: from, lt: to } };
    const [customers, stamps, redemptions, recent, earns] = await Promise.all([
      this.prisma.customer.count({ where: scope }),
      this.prisma.stampTransaction.count({ where: { ...scope, ...period, type: "EARN" } }),
      this.prisma.rewardRedemption.count({ where: { ...scope, ...period, status: "COMPLETED" } }),
      this.prisma.stampTransaction.findMany({
        where: { ...scope, ...period },
        include: { customer: true, employee: true, program: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      this.prisma.stampTransaction.findMany({
        where: { ...scope, ...period, type: "EARN" },
        select: { createdAt: true, customerId: true },
      }),
    ]);
    const visitsByCustomer = new Map<string, number>();
    const byDay = new Map<string, number>();
    for (const earn of earns) {
      visitsByCustomer.set(earn.customerId, (visitsByCustomer.get(earn.customerId) || 0) + 1);
      const day = earn.createdAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }
    let recurrent = 0;
    for (const count of visitsByCustomer.values()) {
      if (count >= 2) recurrent += 1;
    }
    const series: Array<{ day: string; total: number }> = [];
    for (let cursor = new Date(from); cursor < to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const day = cursor.toISOString().slice(0, 10);
      series.push({ day, total: byDay.get(day) || 0 });
    }
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      customers,
      stamps,
      redemptions,
      visits: stamps,
      recurrentCustomers: recurrent,
      series,
      activity: recent.map((row) => ({
        id: row.id,
        type: row.type,
        at: row.createdAt,
        customerName: row.customer.name,
        employeeName: row.employee.name,
        programName: row.program.name,
        balanceAfter: row.balanceAfter,
        stampsDelta: row.stampsDelta,
      })),
    };
  }
}
