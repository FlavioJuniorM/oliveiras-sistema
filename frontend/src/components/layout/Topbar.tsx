import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export function Topbar({ titulo }: { titulo: string }) {
  const { usuario, sair } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
      <h1 className="font-display text-2xl tracking-wide text-ink">{titulo}</h1>

      <div className="flex items-center gap-4">
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-semibold text-ink">{usuario?.nome}</p>
          <p className="text-xs text-muted">
            {usuario?.papel === "ADMINISTRATIVO" ? "Administrativo" : "Funcionário"} ·{" "}
            <Link to="/minha-senha" className="font-semibold text-primary hover:underline">Trocar senha</Link>
          </p>
        </div>
        <button
          onClick={sair}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink hover:bg-background"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
