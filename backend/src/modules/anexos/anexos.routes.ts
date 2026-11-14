import express, { Router } from "express";
import { prisma } from "../../config/database";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import { registrarLog } from "../../shared/registrarLog";
import { formatarDataCalendario } from "../../shared/datas";

/**
 * Comprovantes de pagamento e recibos assinados (foto ou PDF) de uma conta a pagar.
 * O arquivo vai no corpo da requisição (binário), não em JSON.
 * Limite de 4 MB por arquivo (limite da Vercel); fotos já chegam reduzidas pelo navegador.
 */
export const anexosRouter = Router();
anexosRouter.use(autenticar, somentePapel("ADMINISTRATIVO"));

const TAMANHO_MAXIMO = 4 * 1024 * 1024;
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

// Confere o conteúdo real do arquivo (não só o nome/tipo informado)
function tipoPeloConteudo(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (b.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (b.subarray(4, 8).toString("ascii") === "ftyp" && /heic|heix|mif1|msf1|heif/.test(b.subarray(8, 12).toString("ascii"))) return "image/heic";
  return null;
}

// POST /anexos?contaPagarId=...&tipo=COMPROVANTE|RECIBO_ASSINADO   (corpo = o arquivo)
anexosRouter.post(
  "/",
  express.raw({ type: () => true, limit: TAMANHO_MAXIMO }),
  async (req, res) => {
    const contaPagarId = String(req.query.contaPagarId ?? "");
    const tipo = req.query.tipo === "RECIBO_ASSINADO" ? "RECIBO_ASSINADO" : "COMPROVANTE";
    const corpo = req.body as Buffer;
    if (!contaPagarId) return res.status(400).json({ erro: "Conta não informada." });
    if (!Buffer.isBuffer(corpo) || corpo.length === 0) return res.status(400).json({ erro: "Escolha um arquivo." });

    const tipoMime = tipoPeloConteudo(corpo);
    if (!tipoMime || !TIPOS_ACEITOS.includes(tipoMime)) {
      return res.status(400).json({ erro: "Envie uma foto (JPG, PNG) ou um PDF." });
    }

    try {
      const conta = await prisma.contaPagar.findUnique({ where: { id: contaPagarId } });
      if (!conta) return res.status(404).json({ erro: "Conta não encontrada." });
      let nome = "arquivo";
      try {
        nome = decodeURIComponent(String(req.header("x-nome-arquivo") ?? "arquivo"));
      } catch {
        // nome inválido: usa o padrão
      }
      nome = nome.replace(/[\\/\r\n]/g, "_").slice(0, 120) || "arquivo";

      const anexo = await prisma.anexoConta.create({
        data: { contaPagarId, tipo, nome, tipoMime, tamanho: corpo.length, dados: corpo, criadoPorId: req.usuario!.id },
        select: { id: true, tipo: true, nome: true, tipoMime: true, tamanho: true, criadoEm: true },
      });
      await registrarLog({
        usuarioId: req.usuario!.id,
        acao: "ANEXOU_ARQUIVO",
        entidade: "conta_pagar",
        entidadeId: contaPagarId,
        detalhes: `Anexou ${tipo === "RECIBO_ASSINADO" ? "recibo assinado" : "comprovante"} (${nome}) em ${conta.fornecedor} — ${conta.descricao} (venc. ${formatarDataCalendario(conta.vencimento)})`,
      });
      return res.status(201).json(anexo);
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ erro: "Erro interno ao salvar o arquivo." });
    }
  }
);

// GET /anexos/:id — devolve o arquivo
anexosRouter.get("/:id", async (req, res) => {
  try {
    const anexo = await prisma.anexoConta.findUnique({ where: { id: req.params.id } });
    if (!anexo) return res.status(404).json({ erro: "Arquivo não encontrado." });
    res.setHeader("Content-Type", anexo.tipoMime);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(anexo.nome)}`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.send(Buffer.from(anexo.dados));
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao abrir o arquivo." });
  }
});

anexosRouter.delete("/:id", async (req, res) => {
  try {
    const anexo = await prisma.anexoConta.findUnique({ where: { id: req.params.id }, select: { id: true, nome: true, contaPagarId: true } });
    if (!anexo) return res.status(404).json({ erro: "Arquivo não encontrado." });
    await prisma.anexoConta.delete({ where: { id: anexo.id } });
    await registrarLog({
      usuarioId: req.usuario!.id,
      acao: "EXCLUIU_ANEXO",
      entidade: "conta_pagar",
      entidadeId: anexo.contaPagarId,
      detalhes: `Excluiu o arquivo ${anexo.nome}`,
    });
    return res.status(204).end();
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao excluir o arquivo." });
  }
});
