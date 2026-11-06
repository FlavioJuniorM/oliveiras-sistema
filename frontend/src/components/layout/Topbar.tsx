import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export function Topbar({ titulo }: { titulo: string }) {
  const { usuario } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:px-6 lg:py-4">
      <h1 className="font-display text-xl tracking-wide text-ink lg:text-2xl">{titulo}</h1>

      <div className="flex items-center gap-4">
        <div className="hidden text-right leading-tight sm:block lg:hidden">
          <p className="text-sm font-semibold text-ink">{usuario?.nome}</p>
          <p className="text-xs text-muted">
            {usuario?.papel === "ADMINISTRATIVO" ? "Administrativo" : "Funcionário"} ·{" "}
            <Link to="/minha-senha" className="font-semibold text-primary hover:underline">Trocar senha</Link>
          </p>
        </div>
      </div>
    </header>
  );
}
