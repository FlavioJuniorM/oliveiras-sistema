import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MenuMobile } from "./MenuMobile";

const TITULOS: Record<string, string> = {
  "/": "Dashboard",
  "/pedidos/novo": "Novo Pedido",
  "/pedidos": "Pedidos do Dia",
  "/clientes": "Clientes",
  "/produtos": "Carnes / Cortes",
  "/financeiro/contas-a-receber": "Contas a Receber",
  "/financeiro/contas-a-pagar": "Contas a Pagar",
  "/relatorios": "Relatórios",
  "/usuarios": "Usuários",
  "/configuracoes": "Configurações",
  "/financeiro/caixa": "Fechamento de Caixa",
  "/minha-senha": "Minha senha",
};

export function AppLayout() {
  const location = useLocation();
  const titulo = TITULOS[location.pathname] || "Casa de Carnes Oliveiras";
  const { precisaTrocarSenha } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      {/* min-w-0: impede que conteúdo largo (ex.: faixa de abas rolável) alargue a página no celular */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar titulo={titulo} />
        {precisaTrocarSenha && location.pathname !== "/minha-senha" && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-danger px-4 py-2.5 text-sm font-semibold text-white lg:px-6">
            <span>⚠ Você está usando uma senha fraca ou padrão. Qualquer pessoa pode adivinhá-la.</span>
            <Link to="/minha-senha" className="rounded-lg bg-white px-3 py-1.5 text-danger">Trocar agora</Link>
          </div>
        )}
        <main className="flex-1 p-4 pb-20 lg:pb-6 lg:p-6">
          <Outlet />
        </main>
      </div>
      <MenuMobile />
    </div>
  );
}
