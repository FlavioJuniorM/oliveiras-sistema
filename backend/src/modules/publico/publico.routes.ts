import { contarTentativas, ipDaRequisicao, normalizarTelefone, registrarTentativa } from "../../shared/limites";
import { Router } from "express";
import { z } from "zod";
import { listarCatalogoPublico } from "../produtos/produtos.service";
import { criarPedidoPublico, obterAcompanhamentoPublico, ErroPedido } from "../pedidos/pedidos.service";

export const publicoRouter = Router();

const itemPublicoSchema = z.object({
  produtoId: z.string().uuid(),
  pesoOuQtd: z.number().positive(),
  observacao: z.string().max(200).optional(),
  unidadePedido: z.enum(["kg", "g", "peca", "unidade", "outra"]).optional(),
});

const pedidoPublicoSchema = z
  .object({
    nomeCliente: z.string().trim().min(2, "Informe seu nome."),
    telefoneCliente: z.string().trim().min(8, "Informe um telefone válido."),
    emailCliente: z.string().email("Informe um e-mail válido.").optional().or(z.literal("")),
    tipoEntrega: z.enum(["RETIRADA", "DELIVERY"]),
    momentoPagamento: z.enum(["NA_RETIRADA", "NA_ENTREGA"]),
    enderecoEntrega: z.string().trim().optional(),
    observacoesCliente: z.string().trim().max(500).optional(),
    itens: z.array(itemPublicoSchema).min(1, "Adicione pelo menos um produto."),
  })
  .superRefine((dados, contexto) => {
    if (dados.tipoEntrega === "DELIVERY" && !dados.enderecoEntrega) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["enderecoEntrega"],
        message: "Informe o endereço para delivery.",
      });
    }

    const momentoEsperado = dados.tipoEntrega === "DELIVERY" ? "NA_ENTREGA" : "NA_RETIRADA";
    if (dados.momentoPagamento !== momentoEsperado) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["momentoPagamento"],
        message: "O momento do pagamento deve acompanhar o tipo de entrega.",
      });
    }
  });

publicoRouter.get("/catalogo", async (_req, res) => {
  try {
    return res.json(await listarCatalogoPublico());
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ erro: "Não foi possível carregar o catálogo." });
  }
});

publicoRouter.post("/pedidos", async (req, res) => {
  const validacao = pedidoPublicoSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  // Proteção contra spam: no máximo 3 pedidos por telefone a cada 30 min
  // e 10 pedidos por conexão (IP) a cada hora. Pedido real nunca chega nisso.
  const ip = ipDaRequisicao(req);
  const telefone = normalizarTelefone(validacao.data.telefoneCliente);
  const [porTelefone, porIp] = await Promise.all([
    contarTentativas("PEDIDO_PUBLICO_TELEFONE", telefone, 30),
    contarTentativas("PEDIDO_PUBLICO_IP", ip, 60),
  ]);
  if (porTelefone >= 3 || porIp >= 10) {
    return res.status(429).json({
      erro: "Recebemos vários pedidos seus agora há pouco. Se precisar alterar algo, fale com a loja pelo WhatsApp.",
    });
  }

  try {
    const pedido = await criarPedidoPublico(validacao.data);
    await Promise.all([
      registrarTentativa("PEDIDO_PUBLICO_TELEFONE", telefone),
      registrarTentativa("PEDIDO_PUBLICO_IP", ip),
    ]);
    return res.status(201).json({
      numero: pedido.numero,
      tokenAcompanhamento: pedido.tokenAcompanhamento,
      statusOperacao: pedido.statusOperacao,
      totalEstimado: pedido.estimativaTotal,
    });
  } catch (erro) {
    if (erro instanceof ErroPedido) {
      return res.status(400).json({ erro: erro.message });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Não foi possível registrar o pedido." });
  }
});

publicoRouter.get("/pedidos/:token", async (req, res) => {
  try {
    const acompanhamento = await obterAcompanhamentoPublico(req.params.token);
    if (!acompanhamento) {
      return res.status(404).json({ erro: "Pedido não encontrado." });
    }
    return res.json(acompanhamento);
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ erro: "Não foi possível consultar o pedido." });
  }
});
