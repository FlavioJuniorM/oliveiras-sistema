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

  return <div className="mx-auto max-w-3xl"><div><p className="text-sm text-muted">Regras operacionais do balcão</p></div><Card className="mt-5"><CardTitulo>Tolerância de pesagem</CardTitulo><CardSubtitulo className="mt-1">Percentual acima do peso pedido a partir do qual o sistema avisa o balcão.</CardSubtitulo><form onSubmit={salvar} className="mt-6"><div className="max-w-xs"><Input label="Tolerância permitida (%)" type="number" min="0" max="100" step="0.1" value={tolerancia} disabled={carregando} onChange={(e) => setTolerancia(e.target.value)} /></div><p className="mt-3 text-sm text-muted">Exemplo: com 10%, num pedido de 1 kg o sistema avisa quando o peso passar de 1,1 kg. O aviso não impede: o balcão pode confirmar o peso mesmo assim.</p>{erro && <p className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}{mensagem && <p className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">{mensagem}</p>}<Button type="submit" className="mt-5" disabled={carregando || salvando}>{salvando ? "Salvando..." : "Salvar configuração"}</Button></form></Card><SecaoMotoboys /></div>;
}


interface Motoboy { id: string; nome: string; telefone: string }

function formatarTelefone(telefone: string) {
  const d = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

/** Cadastro dos motoboys: a mensagem da rota abre direto na conversa deles no WhatsApp. */
function SecaoMotoboys() {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = () => api<Motoboy[]>("/motoboys").then(setMotoboys).catch(() => setErro("Não foi possível carregar os motoboys."));
  useEffect(() => { carregar(); }, []);

  async function adicionar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await api("/motoboys", { method: "POST", body: { nome, telefone } });
      setNome("");
      setTelefone("");
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(motoboy: Motoboy) {
    if (!window.confirm(`Remover ${motoboy.nome} da lista de motoboys?`)) return;
    await api(`/motoboys/${motoboy.id}/inativar`, { method: "PATCH" }).catch(() => setErro("Não foi possível remover."));
    carregar();
  }

  return <Card className="mt-5">
    <CardTitulo>Motoboys</CardTitulo>
    <CardSubtitulo className="mt-1">Com o WhatsApp cadastrado, o botão da rota abre direto na conversa do motoboy escolhido.</CardSubtitulo>
    <div className="mt-4 divide-y divide-border rounded-lg border border-border">
      {motoboys.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nenhum motoboy cadastrado ainda.</p>}
      {motoboys.map((motoboy) => <div key={motoboy.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-semibold text-ink">🛵 {motoboy.nome}</p><p className="text-sm text-muted">{formatarTelefone(motoboy.telefone)}</p></div><Button variante="fantasma" className="!text-danger" onClick={() => remover(motoboy)}>Remover</Button></div>)}
    </div>
    <form onSubmit={adicionar} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Input label="Nome" placeholder="Ex.: Carlos" value={nome} onChange={(e) => setNome(e.target.value)} required />
      <Input label="WhatsApp com DDD" inputMode="tel" placeholder="(11) 98888-1234" value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
      <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Adicionar"}</Button>
    </form>
    {erro && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
  </Card>;
}
