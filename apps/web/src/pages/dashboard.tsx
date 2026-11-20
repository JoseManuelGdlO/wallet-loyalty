import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/utils";

type Dashboard = {
  customers: number;
  stamps: number;
  redemptions: number;
  visits: number;
  recurrentCustomers: number;
  series: Array<{ day: string; total: number }>;
  activity: Array<{ id: string; type: string; at: string; customerName: string; employeeName: string; programName: string; balanceAfter: number }>;
};

const labels: Record<string, string> = { EARN: "Sello", REDEEM: "Canje", REVERSAL: "Reversión" };

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Dashboard>("/api/analytics/dashboard").then(setData).catch((cause: Error) => setError(cause.message));
  }, []);
  if (error) return <p className="text-[#9e3b32]">{error}</p>;
  if (!data) return <p className="text-ink/60">Cargando el panel…</p>;
  const figures = [
    ["Clientes", data.customers],
    ["Sellos", data.stamps],
    ["Visitas", data.visits],
    ["Canjes", data.redemptions],
    ["Recurrentes", data.recurrentCustomers],
  ];
  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm uppercase tracking-[0.18em] text-brass">Hoy en el negocio</p>
        <h1 className="font-display text-4xl">Actividad de lealtad</h1>
      </header>
      <section className="grid gap-3 sm:grid-cols-5">
        {figures.map(([label, value]) => (
          <article key={String(label)} className="rounded-3xl bg-paper px-4 py-4 shadow-card">
            <p className="text-sm text-ink/60">{label}</p>
            <p className="font-display text-3xl">{value}</p>
          </article>
        ))}
      </section>
      <section className="rounded-3xl bg-paper p-4 shadow-card">
        <h2 className="mb-3 font-display text-2xl">Visitas por día</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.series}>
              <XAxis dataKey="day" hide />
              <YAxis allowDecimals={false} width={28} />
              <Tooltip />
              <Bar dataKey="total" fill="#102033" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-3xl bg-paper p-4 shadow-card">
        <h2 className="font-display text-2xl">Actividad reciente</h2>
        <ul className="mt-3 divide-y divide-ink/10">
          {data.activity.length === 0 && <li className="py-4 text-ink/60">Todavía no hay visitas en este periodo.</li>}
          {data.activity.map((item) => (
            <li key={item.id} className="grid gap-1 py-3 text-sm md:grid-cols-[120px_1fr_1fr]">
              <span>{labels[item.type] || item.type}</span>
              <span>{item.customerName} · {item.programName}</span>
              <span className="text-ink/60">{formatWhen(item.at)} · {item.employeeName} · saldo {item.balanceAfter}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
