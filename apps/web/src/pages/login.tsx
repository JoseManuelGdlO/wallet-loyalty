import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { StampMark } from "@/components/stamp-grid";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { useSession } from "@/session";

export function LoginPage() {
  const { user, ready, login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!ready) return <p className="p-8">Cargando…</p>;
  if (user && user.role !== "CUSTOMER") return <Navigate to="/app" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await login(email, password);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo iniciar sesión");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink p-10 text-paper md:flex">
        <StampMark />
        <div>
          <p className="font-display text-5xl leading-tight">Diez cafés.<br />Un sello a la vez.</p>
          <p className="mt-4 max-w-sm text-paper/70">La tarjeta vive en el teléfono. El sello solo entra cuando alguien del negocio lo confirma.</p>
        </div>
      </section>
      <section className="grid place-items-center px-6">
        <form onSubmit={onSubmit} className="grid w-full max-w-sm gap-4">
          <h1 className="font-display text-4xl">Entrar</h1>
          <Field label="Correo">
            <Input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          <Field label="Contraseña">
            <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </Field>
          {error && <p className="text-sm text-[#9e3b32]">{error}</p>}
          <Button disabled={pending}>{pending ? "Entrando…" : "Entrar"}</Button>
          {import.meta.env.DEV && (
            <p className="text-xs text-ink/50">
              Local: ana.admin@cafeteria-demo.test o luis.empleado@cafeteria-demo.test · Demo1234!
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
