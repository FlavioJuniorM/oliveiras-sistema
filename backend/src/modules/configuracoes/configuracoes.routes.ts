import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import {
  atualizarConfiguracaoPesagem,
  obterConfiguracaoPesagem,
} from "./configuracoes.service";

export const configuracoesRouter = Router();

configuracoesRouter.get("/pesagem", autenticar, async (_req, res) => {
  return res.json(await obterConfiguracaoPesagem());
});

configuracoesRouter.patch(
  "/pesagem",
  autenticar,
  somentePapel("ADMINISTRATIVO"),
  async (req, res) => {
    const validacao = z
      .object({ toleranciaPesagemPercentual: z.number().min(0).max(100) })
      .safeParse(req.body);

    if (!validacao.success) {
      return res.status(400).json({
        erro: "A tolerância deve ser um percentual entre 0 e 100.",
      });
    }

    return res.json(
      await atualizarConfiguracaoPesagem(
        validacao.data.toleranciaPesagemPercentual,
        req.usuario!.id
      )
    );
  }
);
