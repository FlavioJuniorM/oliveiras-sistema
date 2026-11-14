import cors from "cors";
import express from "express";
import helmet from "helmet";
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
import { publicoRouter } from "./modules/publico/publico.routes";
import { configuracoesRouter } from "./modules/configuracoes/configuracoes.routes";
import { motoboysRouter } from "./modules/motoboys/motoboys.routes";
import { caixaRouter } from "./modules/caixa/caixa.routes";
import { fornecedoresRouter } from "./modules/fornecedores/fornecedores.routes";
import { funcionariosRouter } from "./modules/funcionarios/funcionarios.routes";
import { anexosRouter } from "./modules/anexos/anexos.routes";
import { avisosRouter } from "./modules/avisos/avisos.routes";

export const app = express();
// Atrás do proxy da Vercel: necessário para enxergar o IP real do cliente
app.set("trust proxy", true);

app.disable("x-powered-by");
// Cabeçalhos de segurança (bloqueia o site dentro de iframes, força HTTPS etc.)
app.use(helmet());

// Só o site da loja pode chamar a API pelo navegador. Sem CORS_ORIGIN configurado,
// vale o endereço oficial (e o localhost para desenvolvimento) — nunca "qualquer site".
const origensPermitidas = (process.env.CORS_ORIGIN || "https://oliveiras-frontend.vercel.app,http://localhost:5173")
  .split(",")
  .map((origem) => origem.trim())
  .filter(Boolean);

app.use(cors({ origin: origensPermitidas }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    nome: "API Casa de Carnes Oliveiras",
    status: "ok",
    health: "/health",
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Rotas públicas do catálogo, checkout e acompanhamento por token.
app.use("/publico", publicoRouter);
app.use("/configuracoes", configuracoesRouter);

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
app.use("/motoboys", motoboysRouter);
app.use("/caixa", caixaRouter);
app.use("/fornecedores", fornecedoresRouter);
app.use("/funcionarios", funcionariosRouter);
app.use("/anexos", anexosRouter);
app.use("/avisos", avisosRouter);

// MVP completo (seção 21). Próximas melhorias possíveis: estoque, integração fiscal
// (NF-e/NFC-e), integração com Pix, WhatsApp e outras automações.
