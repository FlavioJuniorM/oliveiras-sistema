import { Outlet, useLocation } from "react-router-dom";
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
};

export function AppLayout() {
  const location = useLocation();
  const titulo = TITULOS[location.pathname] || "Casa de Carnes Oliveiras";

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      {/* min-w-0: impede que conteúdo largo (ex.: faixa de abas rolável) alargue a página no celular */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar titulo={titulo} />
        <main className="flex-1 p-4 pb-24 lg:pb-6 lg:p-6">
          <Outlet />
        </main>
      </div>
      <MenuMobile />
    </div>
  );
}
