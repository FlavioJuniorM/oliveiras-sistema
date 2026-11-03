import { FormEvent, useEffect, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { Card, CardSubtitulo, CardTitulo } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

export function Configuracoes() {
  const [tolerancia, setTolerancia] = useState("10");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    api<{ toleranciaPesagemPercentual: number }>("/configuracoes/pesagem")
      .then((configuracao) => setTolerancia(String(configuracao.toleranciaPesagemPercentual)))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as configurações."))
      .finally(() => setCarregando(false));
  }, []);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setMensagem("");
    const valor = Number(tolerancia.replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      setErro("Informe um percentual entre 0 e 100.");
      return;
    }

    setSalvando(true);
    try {
      const configuracao = await api<{ toleranciaPesagemPercentual: number }>("/configuracoes/pesagem", {
        method: "PATCH",
        body: { toleranciaPesagemPercentual: valor },
      });
      setTolerancia(String(configuracao.toleranciaPesagemPercentual));
      setMensagem("Configuração salva. A nova tolerância será usada nas próximas conferências.");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar a configuração.");
    } finally {
      setSalvando(false);
    }
  }

  return <div className="mx-auto max-w-3xl"><div><p className="text-sm text-muted">Regras operacionais do balcão</p><h2 className="mt-1 font-display text-3xl uppercase tracking-wide text-ink">Configurações</h2></div><Card className="mt-5"><CardTitulo>Tolerância de pesagem</CardTitulo><CardSubtitulo className="mt-1">Percentual máximo acima do peso solicitado antes que o sistema peça correção.</CardSubtitulo><form onSubmit={salvar} className="mt-6"><div className="max-w-xs"><Input label="Tolerância permitida (%)" type="number" min="0" max="100" step="0.1" value={tolerancia} disabled={carregando} onChange={(e) => setTolerancia(e.target.value)} /></div><p className="mt-3 text-sm text-muted">Exemplo: com 10%, um pedido de 1 kg pode ser conferido até 1,1 kg. Acima disso, o sistema bloqueia a confirmação do corte.</p>{erro && <p className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}{mensagem && <p className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">{mensagem}</p>}<Button type="submit" className="mt-5" disabled={carregando || salvando}>{salvando ? "Salvando..." : "Salvar configuração"}</Button></form></Card></div>;
}
