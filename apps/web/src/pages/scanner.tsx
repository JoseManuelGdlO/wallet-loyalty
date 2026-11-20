import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useState } from "react";
import { StampGrid } from "@/components/stamp-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ApiError, api } from "@/lib/api";

type Lookup = {
  id: string;
  customerName: string;
  programName: string;
  businessName: string;
  rewardTitle: string;
  rewardAvailable: boolean;
  stampIcon: string;
  stamps: { slots: boolean[]; label: string; current: number; required: number };
};

type StampResult = Lookup & { replay: boolean; wallet: { apple: { status: string; detail: string }; google: { status: string; detail: string } } };

export function ScannerPage() {
  const [manual, setManual] = useState("");
  const [card, setCard] = useState<Lookup | null>(null);
  const [token, setToken] = useState("");
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [cameraNote, setCameraNote] = useState("Apuntando la cámara…");

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    let ignore = false;
    let running = false;
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          if (ignore) return;
          ignore = true;
          void scanner.pause(true);
          openCard(decoded.trim());
        },
        () => undefined,
      )
      .then(() => {
        running = true;
        if (ignore) return scanner.stop().catch(() => undefined);
      })
      .catch(() => {
        if (!ignore) setCameraNote("La cámara no está disponible. Pega el código de la tarjeta.");
      });
    return () => {
      ignore = true;
      if (!running) return;
      try {
        void scanner.stop().catch(() => undefined);
      } catch {
        // La cámara todavía no había arrancado.
      }
    };
  }, []);

  async function openCard(value: string) {
    setError("");
    setMessage("");
    setCard(null);
    try {
      const found = await api<Lookup>("/api/loyalty/cards/lookup", {
        method: "POST",
        body: JSON.stringify({ token: value }),
      });
      setToken(value);
      setKey(crypto.randomUUID());
      setCard(found);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo leer la tarjeta");
    }
  }

  async function confirm() {
    if (!card) return;
    setPending(true);
    setError("");
    try {
      const result = await api<StampResult>(`/api/loyalty/cards/${card.id}/stamps`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ scanToken: token }),
      });
      setCard(result);
      setMessage(result.rewardAvailable ? "Recompensa lista." : "Sello registrado.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se registró el sello");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <h1 className="font-display text-4xl">Escanear</h1>
      <p className="text-sm text-ink/70">El código solo identifica la tarjeta. El sello se registra cuando confirmas.</p>
      <div id="qr-reader" className="overflow-hidden rounded-3xl bg-ink" />
      <p className="text-xs text-ink/50">{cameraNote}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void openCard(manual.trim());
        }}
      >
        <Input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Pegar código" />
        <Button type="submit" variant="brass">Ver</Button>
      </form>
      {error && <p className="text-[#9e3b32]">{error}</p>}
      {card && (
        <article className={`punch-card p-5 ${message ? "stamp-pop" : ""}`}>
          <p className="text-xs uppercase tracking-[0.16em] text-brass">{card.businessName}</p>
          <h2 className="font-display text-3xl">{card.customerName}</h2>
          <p>{card.programName}</p>
          <div className="my-4"><StampGrid large slots={card.stamps.slots} icon={card.stampIcon} /></div>
          <p>{card.stamps.label}</p>
          {card.rewardAvailable && <p className="mt-2 text-seal">Recompensa: {card.rewardTitle}</p>}
          {message && <p className="mt-3 text-seal">{message}</p>}
          {!message && (
            <Button className="mt-4 w-full" variant="seal" disabled={pending} onClick={() => void confirm()}>
              {pending ? "Registrando…" : "Registrar sello"}
            </Button>
          )}
          {message && (
            <Button className="mt-4 w-full" variant="ghost" onClick={() => { setCard(null); setMessage(""); setManual(""); }}>
              Escanear otra
            </Button>
          )}
        </article>
      )}
    </div>
  );
}
