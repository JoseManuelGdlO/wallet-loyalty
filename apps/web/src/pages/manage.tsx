import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShare } from "@/components/public-share";
import { StampGrid } from "@/components/stamp-grid";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api";
import { formatWhen } from "@/lib/utils";
import { useSession } from "@/session";

type Business = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  active: boolean;
  primaryColor: string;
  _count?: { customers: number; programs: number };
};

type Program = {
  id: string;
  businessId: string;
  name: string;
  description?: string | null;
  stampsRequired: number;
  rewardTitle: string;
  stampIcon: string;
  status: string;
  maxStampsPerDay: number;
  cooldownSeconds: number;
  cardBackground: string;
  cardForeground: string;
  cardLabel: string;
  blockWhenRewardAvailable: boolean;
};

type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  programs: string[];
  stamps: number;
  rewardsAvailable: number;
  lastVisit: string | null;
};

export function BusinessesPage() {
  const { user } = useSession();
  const [rows, setRows] = useState<Business[]>([]);
  const [plans, setPlans] = useState<Array<{ code: string; name: string }>>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function load() {
    api<Business[]>("/api/businesses").then(setRows).catch((cause: Error) => setError(cause.message));
    api<Array<{ code: string; name: string }>>("/api/plans").then(setPlans).catch(() => undefined);
  }
  useEffect(load, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    try {
      await api("/api/businesses", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          slug: form.get("slug"),
          adminName: form.get("adminName"),
          adminEmail: form.get("adminEmail"),
          adminPassword: form.get("adminPassword"),
          planCode: form.get("planCode"),
          description: form.get("description") || undefined,
        }),
      });
      setMessage("Negocio creado");
      formElement.reset();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo crear");
    }
  }

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-4xl">Negocios</h1>
      {error && <p className="text-[#9e3b32]">{error}</p>}
      {message && <p className="text-seal">{message}</p>}
      <div className="grid gap-3">
        {rows.map((business) => (
          <article key={business.id} className="rounded-3xl bg-paper p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">{business.name}</h2>
                <p className="text-sm text-ink/60">/c/{business.slug} · {business._count?.customers ?? 0} clientes</p>
              </div>
              <span className="text-sm">{business.active ? "Activo" : "Suspendido"}</span>
            </div>
            <div className="mt-4"><PublicShare slug={business.slug} name={business.name} /></div>
            {user?.role === "SUPER_ADMIN" && (
              <Button
                className="mt-3"
                variant="ghost"
                onClick={() =>
                  api(`/api/businesses/${business.id}/status`, {
                    method: "PATCH",
                    body: JSON.stringify({ active: !business.active }),
                  }).then(load)
                }
              >
                {business.active ? "Suspender" : "Activar"}
              </Button>
            )}
            {user?.role !== "EMPLOYEE" && <StaffPanel businessId={business.id} />}
          </article>
        ))}
      </div>
      {user?.role === "SUPER_ADMIN" && (
        <form onSubmit={create} className="grid gap-3 rounded-3xl bg-paper p-4 shadow-card md:grid-cols-2">
          <h2 className="font-display text-2xl md:col-span-2">Nuevo negocio</h2>
          <Field label="Nombre"><Input name="name" required /></Field>
          <Field label="Identificador público"><Input name="slug" required placeholder="cafeteria-centro" /></Field>
          <Field label="Administrador"><Input name="adminName" required /></Field>
          <Field label="Correo"><Input name="adminEmail" type="email" required /></Field>
          <Field label="Contraseña temporal"><Input name="adminPassword" type="password" minLength={8} required /></Field>
          <Field label="Plan">
            <select name="planCode" className="h-11 rounded-2xl border border-ink/10 bg-white px-3" required>
              {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
            </select>
          </Field>
          <Field label="Descripción"><Textarea name="description" /></Field>
          <Button className="md:col-span-2">Crear negocio</Button>
        </form>
      )}
    </div>
  );
}

function StaffPanel({ businessId }: { businessId: string }) {
  const [staff, setStaff] = useState<Array<{ id: string; name: string; email: string; role: string; branchName: string | null }>>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function load() {
    api<typeof staff>(`/api/businesses/${businessId}/employees`).then(setStaff).catch((cause: Error) => setError(cause.message));
  }
  useEffect(load, [businessId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    try {
      await api(`/api/businesses/${businessId}/employees`, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setMessage("Empleado registrado");
      formElement.reset();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo registrar");
    }
  }

  return (
    <div className="mt-4 border-t border-ink/10 pt-3">
      <p className="text-sm text-ink/60">Equipo</p>
      <ul className="mt-2 grid gap-1 text-sm">
        {staff.map((person) => (
          <li key={person.id}>{person.name} · {person.email} · {person.role === "BUSINESS_ADMIN" ? "Administración" : "Escáner"}{person.branchName ? ` · ${person.branchName}` : ""}</li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-[#9e3b32]">{error}</p>}
      {message && <p className="mt-2 text-sm text-seal">{message}</p>}
      <form onSubmit={create} className="mt-3 grid gap-2 md:grid-cols-4">
        <Input name="name" required placeholder="Nombre" />
        <Input name="email" type="email" required placeholder="Correo" />
        <Input name="password" type="password" required minLength={8} placeholder="Contraseña temporal" />
        <Button type="submit" variant="brass">Registrar empleado</Button>
      </form>
    </div>
  );
}

function ProgramEditor({ program, onSaved }: { program: Program; onSaved: () => void }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await api(`/api/loyalty/programs/${program.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          businessId: program.businessId,
          name: form.get("name"),
          description: form.get("description") || undefined,
          stampsRequired: Number(form.get("stampsRequired")),
          rewardTitle: form.get("rewardTitle"),
          rewardDescription: form.get("rewardDescription") || undefined,
          stampIcon: form.get("stampIcon") || "●",
          cardBackground: form.get("cardBackground"),
          cardForeground: form.get("cardForeground"),
          cardLabel: form.get("cardLabel"),
          maxStampsPerDay: Number(form.get("maxStampsPerDay")),
          cooldownSeconds: Number(form.get("cooldownSeconds")),
          blockWhenRewardAvailable: program.blockWhenRewardAvailable,
          status: form.get("status"),
        }),
      });
      setMessage("Programa actualizado. Las tarjetas nuevas y las actualizaciones de Wallet usan estos datos.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo guardar");
    }
  }

  return (
    <form onSubmit={save} className="mt-4 grid gap-2 border-t border-ink/10 pt-3">
      <p className="text-sm text-ink/60">Así se ve la tarjeta en Wallet y en la página pública.</p>
      <Input name="name" defaultValue={program.name} required />
      <Input name="rewardTitle" defaultValue={program.rewardTitle} required />
      <div className="grid grid-cols-2 gap-2">
        <Input name="stampsRequired" type="number" min={1} max={50} defaultValue={program.stampsRequired} required />
        <Input name="stampIcon" defaultValue={program.stampIcon} maxLength={8} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input name="cardBackground" type="color" defaultValue={program.cardBackground} required />
        <Input name="cardForeground" type="color" defaultValue={program.cardForeground} required />
        <Input name="cardLabel" type="color" defaultValue={program.cardLabel} required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input name="maxStampsPerDay" type="number" min={1} defaultValue={program.maxStampsPerDay} required />
        <Input name="cooldownSeconds" type="number" min={0} defaultValue={program.cooldownSeconds} required />
      </div>
      <select name="status" defaultValue={program.status} className="h-11 rounded-2xl border border-ink/10 bg-white px-3">
        <option value="ACTIVE">Activo</option>
        <option value="INACTIVE">Inactivo</option>
      </select>
      {error && <p className="text-sm text-[#9e3b32]">{error}</p>}
      {message && <p className="text-sm text-seal">{message}</p>}
      <Button type="submit" variant="brass">Guardar apariencia</Button>
    </form>
  );
}

export function ProgramsPage() {
  const { user } = useSession();
  const [rows, setRows] = useState<Program[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [error, setError] = useState("");
  function load() {
    api<Program[]>("/api/loyalty/programs").then(setRows).catch((cause: Error) => setError(cause.message));
    api<Business[]>("/api/businesses").then(setBusinesses).catch(() => undefined);
  }
  useEffect(load, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/api/loyalty/programs", {
        method: "POST",
        body: JSON.stringify({
          businessId: form.get("businessId"),
          name: form.get("name"),
          description: form.get("description"),
          stampsRequired: Number(form.get("stampsRequired")),
          rewardTitle: form.get("rewardTitle"),
          rewardDescription: form.get("rewardDescription"),
          stampIcon: form.get("stampIcon") || "●",
          cardBackground: form.get("cardBackground"),
          cardForeground: form.get("cardForeground"),
          cardLabel: form.get("cardLabel"),
          maxStampsPerDay: Number(form.get("maxStampsPerDay")),
          cooldownSeconds: Number(form.get("cooldownSeconds")),
          blockWhenRewardAvailable: true,
          status: "ACTIVE",
        }),
      });
      formElement.reset();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo guardar el programa");
    }
  }

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-4xl">Programas</h1>
      {error && <p className="text-[#9e3b32]">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((program) => (
          <article key={program.id} className="rounded-3xl bg-paper p-4 shadow-card" style={{ borderTop: `6px solid ${program.cardBackground}` }}>
            <h2 className="font-display text-2xl">{program.name}</h2>
            <p className="text-sm text-ink/70">{program.rewardTitle}</p>
            <div className="mt-3">
              <StampGrid slots={Array.from({ length: program.stampsRequired }, () => false)} icon={program.stampIcon} />
            </div>
            <p className="mt-2 text-sm text-ink/60">{program.stampsRequired} sellos · máximo {program.maxStampsPerDay} al día · {program.status === "ACTIVE" ? "Activo" : "Inactivo"}</p>
            {user?.role !== "EMPLOYEE" && <ProgramEditor program={program} onSaved={load} />}
          </article>
        ))}
      </div>
      <form onSubmit={create} className="grid gap-3 rounded-3xl bg-paper p-4 shadow-card md:grid-cols-2">
        <h2 className="font-display text-2xl md:col-span-2">Nuevo programa</h2>
        <Field label="Negocio">
          <select name="businessId" className="h-11 rounded-2xl border border-ink/10 bg-white px-3" required>
            {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre"><Input name="name" required defaultValue="Café frecuente" /></Field>
        <Field label="Sellos"><Input name="stampsRequired" type="number" min={1} max={50} defaultValue={10} required /></Field>
        <Field label="Recompensa"><Input name="rewardTitle" required defaultValue="Café americano gratis" /></Field>
        <Field label="Ícono"><Input name="stampIcon" defaultValue="☕" maxLength={8} /></Field>
        <Field label="Máximo por día"><Input name="maxStampsPerDay" type="number" min={1} defaultValue={5} required /></Field>
        <Field label="Segundos entre sellos"><Input name="cooldownSeconds" type="number" min={0} defaultValue={90} required /></Field>
        <Field label="Fondo"><Input name="cardBackground" defaultValue="#102033" required /></Field>
        <Field label="Texto"><Input name="cardForeground" defaultValue="#F4F7F8" required /></Field>
        <Field label="Sello"><Input name="cardLabel" defaultValue="#E0B15A" required /></Field>
        <Field label="Descripción"><Textarea name="description" defaultValue="Compra 10 cafés y recibe uno gratis." /></Field>
        <Field label="Detalle de la recompensa"><Textarea name="rewardDescription" /></Field>
        <Button className="md:col-span-2">Guardar programa</Button>
      </form>
    </div>
  );
}

export function CustomersPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => {
      api<{ items: CustomerRow[] }>(`/api/customers?q=${encodeURIComponent(query)}`)
        .then((data) => setRows(data.items))
        .catch((cause: Error) => setError(cause.message));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-4xl">Clientes</h1>
      <Input placeholder="Buscar por nombre, correo o teléfono" value={query} onChange={(event) => setQuery(event.target.value)} />
      {error && <p className="text-[#9e3b32]">{error}</p>}
      <div className="overflow-auto rounded-3xl bg-paper shadow-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-ink/50">
            <tr>
              <th className="p-3">Nombre</th><th>Contacto</th><th>Programas</th><th>Sellos</th><th>Recompensa</th><th>Última visita</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-ink/10">
                <td className="p-3"><Link className="underline" to={`/app/clientes/${row.id}`}>{row.name}</Link></td>
                <td>{row.email || row.phone || "—"}</td>
                <td>{row.programs.join(", ") || "—"}</td>
                <td>{row.stamps}</td>
                <td>{row.rewardsAvailable > 0 ? "Disponible" : "—"}</td>
                <td>{formatWhen(row.lastVisit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-ink/60">No hay clientes con ese criterio.</p>}
      </div>
    </div>
  );
}

type CustomerDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  cards: Array<{
    id: string;
    programName: string;
    stampIcon: string;
    currentStamps: number;
    stampsRequired: number;
    rewardAvailable: boolean;
    rewardTitle: string;
    stamps: { slots: boolean[]; label: string };
  }>;
};

type StampRow = { id: string; type: string; balanceAfter: number; createdAt: string; employeeName: string };

export function CustomerDetailPage({ id }: { id: string }) {
  const { user } = useSession();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function load() {
    api<CustomerDetail>(`/api/customers/${id}`).then(setCustomer).catch((cause: Error) => setError(cause.message));
  }
  useEffect(load, [id]);
  if (error) return <p className="text-[#9e3b32]">{error}</p>;
  if (!customer) return <p>Cargando cliente…</p>;
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-4xl">{customer.name}</h1>
      <p className="text-sm text-ink/60">{customer.email || "Sin correo"} · {customer.phone || "Sin teléfono"} · alta {formatWhen(customer.createdAt)}</p>
      {message && <p className="text-seal">{message}</p>}
      {customer.cards.map((card) => (
        <article key={card.id} className="rounded-3xl bg-paper p-4 shadow-card">
          <h2 className="font-display text-2xl">{card.programName}</h2>
          <p className="text-sm">{card.stamps.label}</p>
          <div className="my-3"><StampGrid slots={card.stamps.slots} icon={card.stampIcon} /></div>
          {user?.role !== "EMPLOYEE" && (
            <CardReversal
              cardId={card.id}
              onDone={() => {
                setMessage("Sello revertido.");
                load();
              }}
              onError={(text) => setError(text)}
            />
          )}
          {card.rewardAvailable && (
            <Button
              variant="seal"
              onClick={() =>
                api(`/api/loyalty/rewards/redeem`, {
                  method: "POST",
                  headers: { "Idempotency-Key": crypto.randomUUID() },
                  body: JSON.stringify({ cardId: card.id }),
                })
                  .then(() => {
                    setMessage("Recompensa canjeada. Empieza un ciclo nuevo.");
                    load();
                  })
                  .catch((cause: Error) => setError(cause.message))
              }
            >
              Canjear {card.rewardTitle}
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}

function CardReversal({ cardId, onDone, onError }: { cardId: string; onDone: () => void; onError: (text: string) => void }) {
  const [latest, setLatest] = useState<StampRow | null>(null);
  const [pending, setPending] = useState(false);
  function load() {
    api<StampRow[]>(`/api/loyalty/cards/${cardId}/transactions`)
      .then((rows) => setLatest(rows[0]?.type === "EARN" ? rows[0] : null))
      .catch(() => setLatest(null));
  }
  useEffect(load, [cardId]);
  if (!latest) return null;
  return (
    <Button
      className="mt-3"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        setPending(true);
        api(`/api/loyalty/transactions/${latest.id}/reverse`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        })
          .then(() => {
            load();
            onDone();
          })
          .catch((cause: Error) => onError(cause instanceof ApiError ? cause.message : "No se pudo revertir"))
          .finally(() => setPending(false));
      }}
    >
      {pending ? "Revirtiendo…" : `Revertir el sello de ${formatWhen(latest.createdAt)}`}
    </Button>
  );
}

export function RewardsPage() {
  const [rows, setRows] = useState<Array<{ id: string; customerName: string; programName: string; rewardTitle: string; stamps: { label: string } }>>([]);
  useEffect(() => {
    api<typeof rows>("/api/loyalty/rewards/pending").then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-4xl">Recompensas listas</h1>
      {rows.length === 0 && <p className="text-ink/60">Nadie tiene una recompensa pendiente.</p>}
      {rows.map((row) => (
        <article key={row.id} className="rounded-3xl bg-paper p-4 shadow-card">
          <h2 className="font-display text-2xl">{row.customerName}</h2>
          <p>{row.programName} · {row.rewardTitle}</p>
          <p className="text-sm text-ink/60">{row.stamps.label}</p>
        </article>
      ))}
    </div>
  );
}
