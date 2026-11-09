import { useEffect, useState } from "react";
import { api, ErroApi } from "../../lib/api";

export interface Duplicado {
  id: string;
  descricao: string;
  motivo: string;
}

export interface ResultadoDuplicidade {
  bloqueio: Duplicado[];
  aviso: Duplicado[];
}

const VAZIO: ResultadoDuplicidade = { bloqueio: [], aviso: [] };

/**
 * Consulta o servidor (com pausa enquanto digita) para ver se o cadastro já existe.
 * `caminho` ex.: "/clientes/duplicados"; parâmetros vazios são ignorados.
 */
export function useDuplicidade(caminho: string, parametros: Record<string, string | number | undefined | null>, ativo = true) {
  const [resultado, setResultado] = useState<ResultadoDuplicidade>(VAZIO);
  const chave = JSON.stringify(parametros);

  useEffect(() => {
    const preenchidos = Object.entries(parametros).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
    if (!ativo || preenchidos.length === 0) {
      setResultado(VAZIO);
      return;
    }
    const busca = new URLSearchParams(preenchidos.map(([k, v]) => [k, String(v).trim()]));
    let cancelado = false;
    const t = setTimeout(() => {
      api<ResultadoDuplicidade>(`${caminho}?${busca}`)
        .then((r) => !cancelado && setResultado(r))
        .catch(() => !cancelado && setResultado(VAZIO));
    }, 450);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho, chave, ativo]);

  return resultado;
}

/** Caixa de aviso: vermelha quando bloqueia (é o mesmo), amarela quando só parece o mesmo. */
export function AvisoDuplicidade({ resultado, tipo }: { resultado: ResultadoDuplicidade; tipo: string }) {
  if (!resultado.bloqueio.length && !resultado.aviso.length) return null;
  const bloqueia = resultado.bloqueio.length > 0;
  const itens = bloqueia ? resultado.bloqueio : resultado.aviso;
  return (
    <div role="alert" className={`rounded-lg border px-3 py-2.5 text-sm ${bloqueia ? "border-danger/40 bg-danger/[0.07] text-ink" : "border-gold/50 bg-gold/[0.12] text-ink"}`}>
      <p className={`font-semibold ${bloqueia ? "text-danger" : "text-gold-texto"}`}>
        {bloqueia ? `⛔ Já existe ${tipo} igual — não dá para cadastrar de novo` : `⚠ Atenção: parece que ${tipo} já está cadastrado`}
      </p>
      <ul className="mt-1 space-y-0.5">
        {itens.slice(0, 3).map((d) => (
          <li key={d.id}>• {d.descricao} <span className="text-muted">({d.motivo})</span></li>
        ))}
      </ul>
      {!bloqueia && <p className="mt-1 text-xs text-muted">Se for outro mesmo, pode salvar — o sistema vai pedir para confirmar.</p>}
    </div>
  );
}

/** Erro 409 de duplicidade que permite continuar com confirmação. */
export function podeConfirmarDuplicado(erro: unknown) {
  return erro instanceof ErroApi && erro.status === 409 && erro.dados?.podeContinuar === true;
}
