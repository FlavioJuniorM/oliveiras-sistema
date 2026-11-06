import type { ComponentType } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  IconeCaixa,
  IconeCarne,
  IconeChave,
  IconeClientes,
  IconeConfig,
  IconeMais,
  IconePagar,
  IconePainel,
  IconePedidos,
  IconeReceber,
  IconeRelatorio,
  IconeSair,
  IconeUsuarios,
} from "../ui/Icones";

interface ItemMenu {
  rotulo: string;
  para: string;
  icone: ComponentType<{ tamanho?: number; className?: string }>;
  somenteAdmin?: boolean;
}

const GRUPOS: { titulo: string; itens: ItemMenu[] }[] = [
  {
    titulo: "Balcão",
    itens: [
      { rotulo: "Dashboard", para: "/", icone: IconePainel, somenteAdmin: true },
      { rotulo: "Pedidos do Dia", para: "/pedidos", icone: IconePedidos },
      { rotulo: "Clientes", para: "/clientes", icone: IconeClientes },
      { rotulo: "Carnes / Cortes", para: "/produtos", icone: IconeCarne },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      { rotulo: "Fechamento de Caixa", para: "/financeiro/caixa", icone: IconeCaixa, somenteAdmin: true },
      { rotulo: "Contas a Receber", para: "/financeiro/contas-a-receber", icone: IconeReceber, somenteAdmin: true },
      { rotulo: "Contas a Pagar", para: "/financeiro/contas-a-pagar", icone: IconePagar, somenteAdmin: true },
      { rotulo: "Relatórios", para: "/relatorios", icone: IconeRelatorio, somenteAdmin: true },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { rotulo: "Usuários", para: "/usuarios", icone: IconeUsuarios, somenteAdmin: true },
      { rotulo: "Configurações", para: "/configuracoes", icone: IconeConfig, somenteAdmin: true },
    ],
  },
];

export function Sidebar() {
  const { usuario, sair } = useAuth();
  const ehAdmin = usuario?.papel === "ADMINISTRATIVO";
  const iniciais = (usuario?.nome ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col bg-gradient-to-b from-[#5c0816] via-[#3d0710] to-[#1d0408] text-white lg:flex">
      {/* Marca */}
      <Link to={ehAdmin ? "/" : "/pedidos"} className="flex items-center gap-3 px-5 pb-5 pt-6">
        <span className="rounded-full bg-white p-0.5 shadow-lg shadow-black/30 ring-2 ring-gold/60">
          <img src="/logo-oliveiras.png" alt="" className="h-12 w-12 rounded-full object-cover" />
        </span>
        <span className="leading-tight">
          <span className="block font-display text-[13px] tracking-[0.18em] text-white/70">CASA DE CARNES</span>
          <span className="block font-display text-xl tracking-wide text-white">OLIVEIRAS</span>
          <span className="block text-[11px] font-medium tracking-wide text-gold-light">O Rei da Costela</span>
        </span>
      </Link>

      {/* Ação principal do balcão sempre à mão */}
      <div className="px-4 pb-4">
        <NavLink
          to="/pedidos/novo"
          className={({ isActive }) =>
            `flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold shadow-lg shadow-black/25 transition ${
              isActive ? "bg-white text-primary" : "bg-primary text-white hover:bg-[#d91a38]"
            }`
          }
        >
          <IconeMais tamanho={20} />
          Novo Pedido
        </NavLink>
      </div>

      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 pb-4">
        {GRUPOS.map((grupo) => {
          const itensVisiveis = grupo.itens.filter((item) => !item.somenteAdmin || ehAdmin);
          if (itensVisiveis.length === 0) return null;

          return (
            <div key={grupo.titulo} className="mt-4 first:mt-1">
              <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">{grupo.titulo}</p>
              <ul className="flex flex-col gap-0.5">
                {itensVisiveis.map((item) => {
                  const Icone = item.icone;
                  return (
                    <li key={item.para}>
                      <NavLink
                        to={item.para}
                        end
                        className={({ isActive }) =>
                          `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${
                            isActive
                              ? "bg-white/[0.13] text-white"
                              : "text-white/70 hover:bg-white/[0.07] hover:text-white"
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gold-light" />}
                            <Icone tamanho={20} className={isActive ? "text-gold-light" : "text-white/55 group-hover:text-white/90"} />
                            {item.rotulo}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Usuário logado */}
      <div className="m-3 rounded-2xl bg-black/25 p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-light font-bold text-[#3d0710]">
            {iniciais}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold text-white">{usuario?.nome}</p>
            <p className="text-xs text-white/55">{ehAdmin ? "Administrativo" : "Funcionário"}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            to="/minha-senha"
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/[0.08] text-xs font-semibold text-white/85 hover:bg-white/15"
          >
            <IconeChave tamanho={15} />
            Senha
          </Link>
          <button
            type="button"
            onClick={sair}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/[0.08] text-xs font-semibold text-white/85 hover:bg-primary hover:text-white"
          >
            <IconeSair tamanho={15} />
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
