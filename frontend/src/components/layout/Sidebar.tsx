import { NavLink } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

interface ItemMenu {
  rotulo: string;
  para: string;
  somenteAdmin?: boolean;
}

const GRUPOS: { titulo: string; itens: ItemMenu[] }[] = [
  { titulo: "", itens: [{ rotulo: "Dashboard", para: "/", somenteAdmin: true }] },
  {
    titulo: "Pedidos",
    itens: [
      { rotulo: "Novo Pedido", para: "/pedidos/novo" },
      { rotulo: "Pedidos do Dia", para: "/pedidos" },
    ],
  },
  {
    titulo: "Clientes",
    itens: [{ rotulo: "Clientes", para: "/clientes" }],
  },
  {
    titulo: "Produtos",
    itens: [{ rotulo: "Carnes / Cortes", para: "/produtos" }],
  },
  {
    titulo: "Financeiro",
    itens: [
      { rotulo: "Contas a Receber", para: "/financeiro/contas-a-receber", somenteAdmin: true },
      { rotulo: "Contas a Pagar", para: "/financeiro/contas-a-pagar", somenteAdmin: true },
    ],
  },
  {
    titulo: "",
    itens: [
      { rotulo: "Relatórios", para: "/relatorios", somenteAdmin: true },
      { rotulo: "Usuários", para: "/usuarios", somenteAdmin: true },
    ],
  },
];

export function Sidebar() {
  const { usuario } = useAuth();
  const ehAdmin = usuario?.papel === "ADMINISTRATIVO";

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-ink text-white">
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
        <img src="/logo-oliveiras.png" alt="Casa de Carnes Oliveiras" className="h-11 w-11 rounded-full" />
        <div className="leading-tight">
          <p className="font-display text-sm tracking-wide text-white">CASA DE CARNES</p>
          <p className="font-display text-lg tracking-wide text-primary -mt-0.5">OLIVEIRAS</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {GRUPOS.map((grupo, idx) => {
          const itensVisiveis = grupo.itens.filter((item) => !item.somenteAdmin || ehAdmin);
          if (itensVisiveis.length === 0) return null;

          return (
            <div key={idx} className="mb-5">
              {grupo.titulo && (
                <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  {grupo.titulo}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {itensVisiveis.map((item) => (
                  <NavLink
                    key={item.para}
                    to={item.para}
                    end={item.para === "/"}
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-white"
                          : "text-white/75 hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    {item.rotulo}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
