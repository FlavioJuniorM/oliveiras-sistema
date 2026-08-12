import cors from "cors";
import express from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { usuariosRouter } from "./modules/usuarios/usuarios.routes";
import { clientesRouter } from "./modules/clientes/clientes.routes";
import { categoriasRouter } from "./modules/categorias/categorias.routes";
import { produtosRouter } from "./modules/produtos/produtos.routes";
import { pedidosRouter } from "./modules/pedidos/pedidos.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { contasPagarRouter } from "./modules/contas-pagar/contasPagar.routes";
import { relatoriosRouter } from "./modules/relatorios/relatorios.routes";
import { impressaoRouter } from "./modules/impressao/impressao.routes";

export const app = express();

const origensPermitidas = process.env.CORS_ORIGIN
  ?.split(",")
  .map((origem) => origem.trim())
  .filter(Boolean);

app.use(cors({ origin: origensPermitidas?.length ? origensPermitidas : true }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    nome: "API Casa de Carnes Oliveiras",
    status: "ok",
    health: "/health",
    frontend: "http://localhost:5173",
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/usuarios", usuariosRouter);
app.use("/clientes", clientesRouter);
app.use("/categorias", categoriasRouter);
app.use("/produtos", produtosRouter);
app.use("/pedidos", pedidosRouter);
app.use("/pedidos", impressaoRouter); // expõe GET /pedidos/:id/impressao
app.use("/dashboard", dashboardRouter);
app.use("/contas-pagar", contasPagarRouter);
app.use("/relatorios", relatoriosRouter);

// MVP completo (seção 21). Próximas melhorias possíveis: estoque, integração fiscal
// (NF-e/NFC-e), integração com Pix, WhatsApp e outras automações.
