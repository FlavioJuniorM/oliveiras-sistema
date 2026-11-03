import { Router } from "express";
import { autenticar } from "../../middlewares/autenticacao";
import { ErroImpressao, gerarComandaA4Html, gerarComandaTermica, gerarComandaTermicaHtml } from "./impressao.service";

export const impressaoRouter = Router();

impressaoRouter.use(autenticar);

/**
 * GET /pedidos/:id/impressao?formato=termica58|termica80|a4&tipo=corte|cliente
 *
 * - tipo=corte: pedido para o balcão dos açougueiros (sem valores)
 * - tipo=cliente (padrão): nota final com logo, pesos e total
 *
 * - termica58/termica80: retorna uma página estreita com impressão automática
 *   no navegador, pronta para impressoras térmicas de balcão
 * - escpos58/escpos80: retorna texto puro para integração ESC/POS
 * - a4: retorna HTML pronto para impressão A4 no navegador (Ctrl+P → "Salvar como PDF"
 *   cobre a exportação para PDF sem precisar de biblioteca extra nesta fase)
 */
impressaoRouter.get("/:id/impressao", async (req, res) => {
  const formato = (req.query.formato as string) || "termica58";

  if (formato === "a4") {
    const html = await gerarComandaA4Html(req.params.id);
    if (!html) {
      return res.status(404).json({ erro: "Pedido não encontrado." });
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }

  if (formato === "termica58" || formato === "termica80") {
    const tipo = req.query.tipo === "corte" ? "corte" : "cliente";
    let html: string | null;
    try {
      html = await gerarComandaTermicaHtml(req.params.id, tipo);
    } catch (erro) {
      if (erro instanceof ErroImpressao) return res.status(400).json({ erro: erro.message });
      throw erro;
    }
    if (!html) {
      return res.status(404).json({ erro: "Pedido não encontrado." });
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }

  const largura = formato === "escpos80" ? 42 : 32;
  const texto = await gerarComandaTermica(req.params.id, largura);

  if (!texto) {
    return res.status(404).json({ erro: "Pedido não encontrado." });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.send(texto);
});
