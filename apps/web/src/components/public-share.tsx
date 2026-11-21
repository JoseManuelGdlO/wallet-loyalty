import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";

export function PublicShare({ slug, name }: { slug: string; name: string }) {
  const url = `${window.location.origin}/c/${slug}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <section className="grid gap-4 rounded-3xl bg-paper p-4 shadow-card sm:grid-cols-[128px_1fr]">
      <div className="grid justify-items-center gap-2 rounded-2xl bg-white p-3">
        <QRCodeSVG value={url} size={104} />
        <p className="text-center text-xs text-ink/50">El cliente lo escanea para registrarse</p>
      </div>
      <div className="grid content-center gap-2">
        <p className="text-sm uppercase tracking-[0.16em] text-brass">Página pública</p>
        <h2 className="font-display text-2xl">{name}</h2>
        <p className="break-all text-sm text-ink/70">{url}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void copy()}>{copied ? "Enlace copiado" : "Copiar enlace"}</Button>
          <a className="inline-flex h-11 items-center rounded-full px-5 text-sm underline" href={url} target="_blank" rel="noreferrer">
            Ver como cliente
          </a>
        </div>
      </div>
    </section>
  );
}
