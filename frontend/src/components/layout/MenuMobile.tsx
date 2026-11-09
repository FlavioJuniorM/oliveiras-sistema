import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

// Atalhos do balcão (sempre visíveis no rodapé do celular/tablet)
const ITENS = [
  { rotulo: "Novo Pedido", para: "/pedidos/novo" },
  { rotulo: "Pedidos", para: "/pedidos" },
  { rotulo: "Clientes", para: "/clientes" },
  { rotulo: "Carnes", para: "/produtos" },
];

// Demais telas, dentro do "Mais"
const MAIS_ADMIN = [
  { rotulo: "Dashboard", para: "/" },
  { rotulo: "Fechamento de Caixa", para: "/financeiro/caixa" },
  { rotulo: "Contas a Receber", para: "/financeiro/contas-a-receber" },
  { rotulo: "Contas a Pagar", para: "/financeiro/contas-a-pagar" },
  { rotulo: "Fornecedores", para: "/financeiro/fornecedores" },
  { rotulo: "Funcionários", para: "/financeiro/funcionarios" },
  { rotulo: "Relatórios", para: "/relatorios" },
  { rotulo: "Usuários", para: "/usuarios" },
  { rotulo: "Configurações", para: "/configuracoes" },
];

/** Menu fixo inferior para telas pequenas — o balcão precisa de acesso rápido no celular/tablet. */
export function MenuMobile() {
  const { usuario, sair } = useAuth();
  const [aberto, setAberto] = useState(false);
  const local = useLocation();
  const ehAdmin = usuario?.papel === "ADMINISTRATIVO";
  const maisAtivo = !ITENS.some((item) => item.para === local.pathname);

  // Fecha o painel ao trocar de página
  useEffect(() => setAberto(false), [local.pathname]);

  const classeItem = (ativo: boolean) =>
    `flex h-14 min-w-0 flex-1 items-center justify-center px-0.5 text-center text-[11px] font-semibold leading-tight sm:text-xs ${ativo ? "text-primary" : "text-white/75"}`;

  return (
    <>
      {aberto && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setAberto(false)}>
          <div
            role="dialog"
            aria-label="Mais opções"
            className="absolute inset-x-0 bottom-14 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
              <div>
                <p className="font-semibold text-ink">{usuario?.nome}</p>
                <p className="text-xs text-muted">{ehAdmin ? "Administrativo" : "Funcionário"}</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} className="h-10 w-10 text-2xl text-muted" aria-label="Fechar">×</button>
            </div>
            <nav className="grid grid-cols-2 gap-2">
              {ehAdmin && MAIS_ADMIN.map((item) => (
                <NavLink
                  key={item.para}
                  to={item.para}
                  end
                  className={({ isActive }) =>
                    `rounded-lg border px-3 py-3 text-sm font-semibold ${isActive ? "border-primary bg-primary/5 text-primary" : "border-border text-ink"}`
                  }
                >
                  {item.rotulo}
                </NavLink>
              ))}
              <NavLink to="/minha-senha" end className="rounded-lg border border-border px-3 py-3 text-sm font-semibold text-ink">Trocar senha</NavLink>
              <button type="button" onClick={sair} className="rounded-lg border border-danger/30 px-3 py-3 text-left text-sm font-semibold text-danger">Sair</button>
            </nav>
          </div>
        </div>
      )}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex border-t border-border bg-ink" aria-label="Menu principal">
        {ITENS.map((item) => (
          <NavLink key={item.para} to={item.para} end className={({ isActive }) => classeItem(isActive && !aberto)}>
            {item.rotulo}
          </NavLink>
        ))}
        <button type="button" aria-expanded={aberto} onClick={() => setAberto((atual) => !atual)} className={classeItem(aberto || maisAtivo)}>
          ☰ Mais
        </button>
      </nav>
    </>
  );
}
