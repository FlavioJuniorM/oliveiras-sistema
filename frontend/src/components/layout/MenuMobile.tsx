import { NavLink } from "react-router-dom";

const ITENS = [
  { rotulo: "Novo Pedido", para: "/pedidos/novo" },
  { rotulo: "Pedidos", para: "/pedidos" },
  { rotulo: "Clientes", para: "/clientes" },
  { rotulo: "Carnes", para: "/produtos" },
];

/** Menu fixo inferior para telas pequenas — o balcão precisa de acesso rápido no celular/tablet. */
export function MenuMobile() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 flex border-t border-border bg-ink">
      {ITENS.map((item) => (
        <NavLink
          key={item.para}
          to={item.para}
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-xs font-semibold ${
              isActive ? "text-primary" : "text-white/70"
            }`
          }
        >
          {item.rotulo}
        </NavLink>
      ))}
    </nav>
  );
}
