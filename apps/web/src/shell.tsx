import { NavLink, Navigate, Outlet } from "react-router-dom";
import { StampMark } from "@/components/stamp-grid";
import { useSession } from "@/session";

const links = [
  { to: "/app", label: "Panel", end: true, roles: ["SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE"] },
  { to: "/app/negocios", label: "Negocios", roles: ["SUPER_ADMIN", "BUSINESS_ADMIN"] },
  { to: "/app/programas", label: "Programas", roles: ["SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE"] },
  { to: "/app/clientes", label: "Clientes", roles: ["SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE"] },
  { to: "/app/escaner", label: "Escáner", roles: ["SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE"] },
  { to: "/app/canjes", label: "Canjes", roles: ["SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE"] },
];

export function Shell() {
  const { user, ready, logout } = useSession();
  if (!ready) return <p className="p-8 text-ink/60">Cargando sesión…</p>;
  if (!user || user.role === "CUSTOMER") return <Navigate to="/login" replace />;
  const visible = links.filter((link) => link.roles.includes(user.role));
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="bg-ink text-paper md:min-h-screen">
        <div className="flex items-center gap-3 px-5 py-6">
          <StampMark />
          <div>
            <p className="font-display text-xl leading-none">Intelekia</p>
            <p className="text-xs text-paper/60">Loyalty</p>
          </div>
        </div>
        <nav className="flex gap-2 overflow-auto px-3 pb-4 md:grid">
          {visible.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm ${isActive ? "bg-brass text-white" : "text-paper/75 hover:bg-white/10"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden px-5 pb-6 md:block">
          <p className="text-sm">{user.name}</p>
          <button className="mt-2 text-sm text-paper/60 underline" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="px-4 py-6 md:px-8">
        <div className="mb-4 flex justify-end md:hidden">
          <button className="text-sm underline" onClick={() => void logout()}>Cerrar sesión</button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
