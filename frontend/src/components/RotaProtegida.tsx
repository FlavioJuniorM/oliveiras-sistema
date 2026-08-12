import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function RotaProtegida({
  children,
  somenteAdmin = false,
}: {
  children: React.ReactNode;
  somenteAdmin?: boolean;
}) {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Carregando...</div>;
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (somenteAdmin && usuario.papel !== "ADMINISTRATIVO") {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <p className="font-display text-2xl text-ink">Acesso restrito</p>
          <p className="text-muted mt-1">Esta área é exclusiva do time administrativo.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
