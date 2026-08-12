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
};

export function AppLayout() {
  const location = useLocation();
  const titulo = TITULOS[location.pathname] || "Casa de Carnes Oliveiras";

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar titulo={titulo} />
        <main className="flex-1 p-4 pb-24 lg:pb-6 lg:p-6">
          <Outlet />
        </main>
      </div>
      <MenuMobile />
    </div>
  );
}
