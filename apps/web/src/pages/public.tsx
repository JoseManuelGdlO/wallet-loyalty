import { FormEvent, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useParams } from "react-router-dom";
import { StampGrid } from "@/components/stamp-grid";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api";

type PublicBusiness = {
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  colors: { primary: string; secondary: string };
  programs: Array<{
    id: string;
    name: string;
    description?: string | null;
    rewardTitle: string;
    stampsRequired: number;
    stampIcon: string;
    stamps: { slots: boolean[] };
  }>;
};

type CardView = {
  businessName: string;
  logoUrl?: string | null;
  customerName: string;
  programName: string;
  rewardTitle: string;
  rewardDescription?: string | null;
  stampIcon: string;
  rewardAvailable: boolean;
  colors: { background: string; foreground: string; label: string };
  stamps: { slots: boolean[]; label: string };
  token: string;
};

export function PublicBusinessPage() {
  const { slug = "" } = useParams();
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ cardUrl: string; token: string } | null>(null);
  const [started] = useState(() => Date.now());

  useEffect(() => {
    api<PublicBusiness>(`/api/public/businesses/${slug}`).then(setBusiness).catch((cause: Error) => setError(cause.message));
  }, [slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const created = await api<{ cardUrl: string; token: string }>("/api/customers/register", {
        method: "POST",
        body: JSON.stringify({
          businessSlug: slug,
          programId: form.get("programId") || undefined,
          name: form.get("name"),
          email: form.get("email") || undefined,
          phone: form.get("phone") || undefined,
          formStartedAt: started,
          companyWebsite: form.get("companyWebsite"),
        }),
      });
      setResult(created);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo crear la tarjeta");
    }
  }

  if (error && !business) return <p className="p-8 text-[#9e3b32]">{error}</p>;
  if (!business) return <p className="p-8">Cargando el negocio…</p>;
  const program = business.programs[0];
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl content-center gap-6 px-4 py-10">
      <p className="text-sm uppercase tracking-[0.18em] text-brass">Tarjeta de lealtad</p>
      {business.logoUrl && <img src={business.logoUrl} alt="" className="h-16 w-auto max-w-[220px] object-contain" />}
      <h1 className="font-display text-5xl" style={{ color: business.colors.primary }}>{business.name}</h1>
      <p className="max-w-xl text-ink/70">{business.description}</p>
      {program && (
        <article className="punch-card p-6">
          <h2 className="font-display text-3xl">{program.name}</h2>
          <p className="mt-1">{program.rewardTitle}</p>
          <div className="my-4"><StampGrid large slots={program.stamps.slots} icon={program.stampIcon} /></div>
          <p className="text-sm text-ink/60">0 de {program.stampsRequired} sellos</p>
        </article>
      )}
      {result ? (
        <div className="rounded-3xl bg-paper p-5 shadow-card">
          <p className="font-display text-3xl">Tu tarjeta está lista</p>
          <Link className="mt-3 inline-block underline" to={`/t/${result.token}`}>Abrir tarjeta</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-3 rounded-3xl bg-paper p-5 shadow-card">
          <h2 className="font-display text-2xl">Quedarme con la tarjeta</h2>
          <Field label="Nombre"><Input name="name" required minLength={2} /></Field>
          <Field label="Correo"><Input name="email" type="email" /></Field>
          <Field label="Teléfono"><Input name="phone" /></Field>
          {business.programs.length > 1 && (
            <Field label="Programa">
              <select name="programId" className="h-11 rounded-2xl border border-ink/10 bg-white px-3">
                {business.programs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
          )}
          <input className="hidden" tabIndex={-1} autoComplete="off" name="companyWebsite" />
          {error && <p className="text-sm text-[#9e3b32]">{error}</p>}
          <p className="text-xs text-ink/50">Hace falta un correo o un teléfono para no duplicar tu tarjeta. No pedimos contraseña.</p>
          <Button>Obtener tarjeta</Button>
        </form>
      )}
    </main>
  );
}

export function PublicCardPage() {
  const { token = "" } = useParams();
  const [card, setCard] = useState<CardView | null>(null);
  const [error, setError] = useState("");
  const [walletNote, setWalletNote] = useState("");

  useEffect(() => {
    api<CardView>(`/api/public/cards/${token}`).then(setCard).catch((cause: Error) => setError(cause.message));
  }, [token]);

  async function apple() {
    setWalletNote("");
    const response = await fetch(`/api/public/cards/${token}/apple.pkpass`);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setWalletNote(data.message || "Apple Wallet no está listo en este servidor");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lealtad.pkpass";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function google() {
    setWalletNote("");
    try {
      const data = await api<{ saveUrl: string }>(`/api/public/cards/${token}/google`, { method: "POST" });
      window.location.href = data.saveUrl;
    } catch (cause) {
      setWalletNote(cause instanceof ApiError ? cause.message : "Google Wallet no está listo en este servidor");
    }
  }

  if (error) return <p className="p-8 text-[#9e3b32]">{error}</p>;
  if (!card) return <p className="p-8">Cargando tarjeta…</p>;
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-4 px-4 py-8">
      <article className="punch-card overflow-hidden" style={{ background: card.colors.background, color: card.colors.foreground }}>
        <div className="p-6">
          {card.logoUrl && <img src={card.logoUrl} alt="" className="mb-3 h-12 w-auto max-w-[180px] object-contain" />}
          <p className="text-xs uppercase tracking-[0.16em]" style={{ color: card.colors.label }}>{card.businessName}</p>
          <h1 className="font-display text-4xl">{card.customerName}</h1>
          <p>{card.programName}</p>
          <div className="my-5"><StampGrid large slots={card.stamps.slots} icon={card.stampIcon} /></div>
          <p>{card.stamps.label}</p>
          <p className="mt-2 text-sm opacity-80">{card.rewardAvailable ? `Lista: ${card.rewardTitle}` : card.rewardTitle}</p>
        </div>
        <div className="grid place-items-center bg-paper py-5 text-ink">
          <QRCodeSVG value={card.token} size={180} />
          <p className="mt-2 text-xs text-ink/50">Muéstralo en el negocio</p>
        </div>
      </article>
      <div className="grid gap-2">
        <Button onClick={() => void apple()}>Agregar a Apple Wallet</Button>
        <Button variant="brass" onClick={() => void google()}>Agregar a Google Wallet</Button>
      </div>
      {walletNote && <p className="text-sm text-ink/70">{walletNote}</p>}
      {card.rewardDescription && <p className="text-sm text-ink/60">{card.rewardDescription}</p>}
    </main>
  );
}
