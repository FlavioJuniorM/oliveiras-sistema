import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { dataLocalISO, formatarDataCalendario, formatarMoeda } from "../../lib/formatadores";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { IconeLapis, IconeLixeira, IconeMais, IconeSetaDir, IconeSetaEsq } from "../../components/ui/Icones";

/** Totais do dia copiados do sistema de caixa da loja. */
interface LancamentoCaixa {
  id: string;
  data: string; // AAAA-MM-DD
  dinheiro: number;
  pix: number;
  cartoes: number;
  total: number;
  observacoes: string | null;
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const FORMAS = [
  { chave: "dinheiro", rotulo: "Dinheiro", icone: "💵" },
  { chave: "pix", rotulo: "Pix", icone: "⚡" },
  { chave: "cartoes", rotulo: "Cartões", icone: "💳" },
] as const;

/** Valor curto para caber na célula do celular: 850 → "850", 1.225,18 → "1,2 mil". */
function moedaCurta(valor: number) {
  if (valor >= 1000) return `${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function diaPorExtenso(dia: string) {
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
}

export function LancamentosCaixa() {
  const hoje = dataLocalISO();
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)) - 1);
  const [diaSelecionado, setDiaSelecionado] = useState(hoje);
  const [lancamentos, setLancamentos] = useState<LancamentoCaixa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [formulario, setFormulario] = useState<{ lancamento?: LancamentoCaixa; data: string } | null>(null);
  const [exclusao, setExclusao] = useState<LancamentoCaixa | null>(null);
  const detalheRef = useRef<HTMLDivElement>(null);

  const chaveMes = `${ano}-${String(mes + 1).padStart(2, "0")}`;

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      setLancamentos(await api<LancamentoCaixa[]>(`/caixa/lancamentos?mes=${chaveMes}`));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar os lançamentos do caixa.");
    } finally {
      setCarregando(false);
    }
  }, [chaveMes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const porDia = useMemo(() => new Map(lancamentos.map((l) => [l.data, l])), [lancamentos]);

  const totaisMes = useMemo(
    () =>
      lancamentos.reduce(
        (soma, l) => ({ dinheiro: soma.dinheiro + l.dinheiro, pix: soma.pix + l.pix, cartoes: soma.cartoes + l.cartoes, total: soma.total + l.total }),
        { dinheiro: 0, pix: 0, cartoes: 0, total: 0 }
      ),
    [lancamentos]
  );

  const primeiroDiaSemana = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const celulas: (string | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => `${chaveMes}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (celulas.length % 7 !== 0) celulas.push(null);
  const diasJaPassados = celulas.filter((d): d is string => !!d && d <= hoje).length;

  function mudarMes(delta: number) {
    const novo = new Date(Date.UTC(ano, mes + delta, 1));
    const chave = `${novo.getUTCFullYear()}-${String(novo.getUTCMonth() + 1).padStart(2, "0")}`;
    setAno(novo.getUTCFullYear());
    setMes(novo.getUTCMonth());
    setDiaSelecionado(hoje.startsWith(chave) ? hoje : `${chave}-01`);
  }

  function irParaHoje() {
    setAno(Number(hoje.slice(0, 4)));
    setMes(Number(hoje.slice(5, 7)) - 1);
    setDiaSelecionado(hoje);
  }

  function escolherDia(dia: string) {
    setDiaSelecionado(dia);
    if (window.innerWidth < 1024) setTimeout(() => detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function aoSalvar(salvo: LancamentoCaixa, idAnterior?: string) {
    setFormulario(null);
    // Se a data mudou para outro mês, leva o calendário até ela
    if (!salvo.data.startsWith(chaveMes)) {
      setAno(Number(salvo.data.slice(0, 4)));
      setMes(Number(salvo.data.slice(5, 7)) - 1);
    } else {
      setLancamentos((atuais) => [...atuais.filter((l) => l.id !== salvo.id && l.id !== idAnterior), salvo].sort((a, b) => a.data.localeCompare(b.data)));
    }
    setDiaSelecionado(salvo.data);
  }

  const lancamentoDoDia = porDia.get(diaSelecionado);
  const diaFuturo = diaSelecionado > hoje;

  return (
    <section aria-labelledby="titulo-lancamentos-caixa" className="flex flex-col gap-4 border-t-2 border-dashed border-border pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="titulo-lancamentos-caixa" className="font-display text-2xl uppercase text-ink sm:text-3xl">Lançamentos do caixa da loja</h2>
          <p className="mt-1 text-sm text-muted">Valores do sistema de caixa, lançados à mão. Escolha o dia no calendário para ver, alterar ou excluir.</p>
        </div>
        <Button tamanho="grande" onClick={() => setFormulario({ data: diaFuturo || porDia.has(diaSelecionado) ? hoje : diaSelecionado })}>
          <IconeMais tamanho={20} />
          Inserir dados
        </Button>
      </div>

      {erro && <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_380px]">
        <Card padded={false} className="p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-background"><IconeSetaEsq /></button>
              <h3 className="min-w-[10.5rem] text-center font-display text-2xl uppercase text-ink" aria-live="polite">{MESES[mes]} {ano}</h3>
              <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-background"><IconeSetaDir /></button>
            </div>
            <div className="flex items-center gap-3">
              {carregando && <span className="text-xs text-muted">Carregando...</span>}
              {!hoje.startsWith(chaveMes) && <Button variante="secundaria" onClick={irParaHoje}>Voltar para hoje</Button>}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {FORMAS.map((forma) => (
              <div key={forma.chave} className="rounded-lg bg-background px-3 py-2.5">
                <p className="text-xs text-muted">{forma.icone} {forma.rotulo} no mês</p>
                <p className="whitespace-nowrap font-display text-lg text-ink sm:text-xl">{formatarMoeda(totaisMes[forma.chave])}</p>
              </div>
            ))}
            <div className="rounded-lg bg-success/[0.09] px-3 py-2.5">
              <p className="text-xs text-muted">Total do mês</p>
              <p className="whitespace-nowrap font-display text-lg text-success sm:text-xl">{formatarMoeda(totaisMes.total)}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {lancamentos.length} de {diasJaPassados} {diasJaPassados === 1 ? "dia lançado" : "dias lançados"} até agora neste mês
          </p>

          <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5">
            {DIAS_SEMANA.map((d) => <div key={d} className="pb-1 text-center text-[11px] font-bold uppercase tracking-wide text-muted sm:text-xs">{d}</div>)}
            {celulas.map((dia, i) => {
              if (!dia) return <div key={`v${i}`} className="min-h-[3.75rem] sm:min-h-[5.5rem]" />;
              const lancamento = porDia.get(dia);
              const futuro = dia > hoje;
              const selecionado = dia === diaSelecionado;
              const faltando = !lancamento && !futuro;
              const cor = lancamento ? "border-success/40 bg-success/[0.07]" : futuro ? "border-border/60 bg-background/60" : "border-border bg-white";
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => escolherDia(dia)}
                  aria-pressed={selecionado}
                  aria-label={`Dia ${Number(dia.slice(8))}: ${lancamento ? `lançado, total ${formatarMoeda(lancamento.total)}` : futuro ? "ainda não chegou" : "sem lançamento"}`}
                  className={`flex min-h-[3.75rem] flex-col items-stretch rounded-lg border p-1 text-left transition sm:min-h-[5.5rem] sm:p-2 ${cor} ${selecionado ? "ring-2 ring-ink ring-offset-1" : "hover:border-ink/40"}`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-bold sm:text-sm ${dia === hoje ? "bg-primary text-white" : futuro ? "text-muted" : "text-ink"}`}>{Number(dia.slice(8))}</span>
                  {lancamento && <span className="mt-auto truncate text-[10px] font-bold leading-tight text-success sm:text-xs xl:hidden">{moedaCurta(lancamento.total)}</span>}
                  {lancamento && <span className="mt-auto hidden whitespace-nowrap text-sm font-bold text-success xl:block">{formatarMoeda(lancamento.total)}</span>}
                  {faltando && <span className="mt-auto hidden text-[11px] text-muted sm:block">sem lançamento</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-success/30" />Dia lançado</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-border bg-white" />Sem lançamento</span>
            <span className="xl:hidden">Valores em reais · toque no dia para ver</span>
          </div>
        </Card>

        <div ref={detalheRef} className="h-fit scroll-mt-4 2xl:sticky 2xl:top-4">
          <Card>
            <p className="border-b border-border pb-3 font-display text-xl uppercase text-ink">{diaPorExtenso(diaSelecionado)}</p>
            {lancamentoDoDia ? (
              <>
                <ul className="divide-y divide-border">
                  {FORMAS.map((forma) => (
                    <li key={forma.chave} className="flex items-center justify-between py-3">
                      <span className="text-ink">{forma.icone} {forma.rotulo}</span>
                      <strong className="text-ink">{formatarMoeda(lancamentoDoDia[forma.chave])}</strong>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex items-center justify-between rounded-lg bg-success/[0.09] px-3 py-3">
                  <span className="font-semibold text-ink">Total do dia</span>
                  <span className="font-display text-2xl text-success">{formatarMoeda(lancamentoDoDia.total)}</span>
                </div>
                {lancamentoDoDia.observacoes && <p className="mt-3 rounded-lg bg-background px-3 py-2 text-sm text-ink">{lancamentoDoDia.observacoes}</p>}
                <div className="mt-4 flex gap-2">
                  <Button variante="secundaria" className="flex-1" onClick={() => setFormulario({ lancamento: lancamentoDoDia, data: lancamentoDoDia.data })}><IconeLapis tamanho={16} />Alterar</Button>
                  <Button variante="secundaria" className="flex-1 !text-danger hover:!bg-danger/5" onClick={() => setExclusao(lancamentoDoDia)}><IconeLixeira tamanho={16} />Excluir</Button>
                </div>
              </>
            ) : diaFuturo ? (
              <p className="py-6 text-center text-sm text-muted">Este dia ainda não chegou.</p>
            ) : (
              <div className="py-5 text-center">
                <p className="text-sm text-muted">Nenhum valor lançado neste dia.</p>
                <Button className="mt-4 w-full" onClick={() => setFormulario({ data: diaSelecionado })}><IconeMais tamanho={18} />Inserir dados deste dia</Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      {formulario && (
        <ModalLancamento
          inicial={formulario}
          diasLancados={porDia}
          onFechar={() => setFormulario(null)}
          onSalvo={aoSalvar}
        />
      )}
      {exclusao && (
        <ModalExcluirLancamento
          lancamento={exclusao}
          onFechar={() => setExclusao(null)}
          onExcluido={() => {
            setLancamentos((atuais) => atuais.filter((l) => l.id !== exclusao.id));
            setExclusao(null);
          }}
        />
      )}
    </section>
  );
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:px-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface p-5 shadow-2xl sm:rounded-card sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-2xl uppercase text-ink">{titulo}</p>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 shrink-0 text-2xl text-muted">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalLancamento({
  inicial,
  diasLancados,
  onFechar,
  onSalvo,
}: {
  inicial: { lancamento?: LancamentoCaixa; data: string };
  diasLancados: Map<string, LancamentoCaixa>;
  onFechar: () => void;
  onSalvo: (salvo: LancamentoCaixa, idAnterior?: string) => void;
}) {
  const editando = inicial.lancamento;
  const textoInicial = (valor?: number) => (valor ? String(valor) : "");
  const [data, setData] = useState(inicial.data);
  const [valores, setValores] = useState({
    dinheiro: textoInicial(editando?.dinheiro),
    pix: textoInicial(editando?.pix),
    cartoes: textoInicial(editando?.cartoes),
  });
  const [observacoes, setObservacoes] = useState(editando?.observacoes ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const numero = (texto: string) => Number(texto.replace(",", ".")) || 0;
  const total = numero(valores.dinheiro) + numero(valores.pix) + numero(valores.cartoes);
  const outroNoMesmoDia = diasLancados.get(data);
  const conflito = outroNoMesmoDia && outroNoMesmoDia.id !== editando?.id;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    if (total <= 0) return setErro("Informe pelo menos um valor.");
    setSalvando(true);
    const corpo = { data, dinheiro: numero(valores.dinheiro), pix: numero(valores.pix), cartoes: numero(valores.cartoes), observacoes: observacoes.trim() || null };
    try {
      const salvo = editando
        ? await api<LancamentoCaixa>(`/caixa/lancamentos/${editando.id}`, { method: "PUT", body: corpo })
        : await api<LancamentoCaixa>("/caixa/lancamentos", { method: "POST", body: corpo });
      onSalvo(salvo, editando?.id);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar o lançamento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={editando ? "Alterar lançamento" : "Inserir dados do caixa"} onFechar={onFechar}>
      <form onSubmit={salvar} className="mt-4 flex flex-col gap-4">
        <Input label="Dia do caixa" type="date" value={data} max={dataLocalISO()} onChange={(e) => e.target.value && setData(e.target.value)} required />
        {conflito && <p className="-mt-2 rounded-lg bg-gold/15 px-3 py-2 text-sm text-ink">O dia {formatarDataCalendario(data)} já tem lançamento ({formatarMoeda(outroNoMesmoDia.total)}). Feche e use “Alterar” nesse dia.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FORMAS.map((forma) => (
            <Input
              key={forma.chave}
              label={`${forma.icone} ${forma.rotulo} (R$)`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0,00"
              value={valores[forma.chave]}
              onChange={(e) => setValores((atual) => ({ ...atual, [forma.chave]: e.target.value }))}
            />
          ))}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-success/[0.09] px-4 py-3">
          <span className="font-semibold text-ink">Total do dia</span>
          <span className="font-display text-2xl text-success">{formatarMoeda(total)}</span>
        </div>
        <div>
          <label htmlFor="obs-caixa" className="text-sm font-medium text-ink">Observações (opcional)</label>
          <textarea id="obs-caixa" rows={2} maxLength={500} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: sangria de R$ 200, diferença no caixa..." className="mt-1.5 w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm outline-none focus:border-primary" />
        </div>
        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" tamanho="grande" disabled={salvando || !!conflito}>{salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar lançamento"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ModalExcluirLancamento({ lancamento, onFechar, onExcluido }: { lancamento: LancamentoCaixa; onFechar: () => void; onExcluido: () => void }) {
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    setErro("");
    setExcluindo(true);
    try {
      await api(`/caixa/lancamentos/${lancamento.id}`, { method: "DELETE" });
      onExcluido();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir.");
      setExcluindo(false);
    }
  }

  return (
    <Modal titulo="Excluir lançamento?" onFechar={onFechar}>
      <div className="mt-4 rounded-lg bg-background p-4 text-sm">
        <p className="font-semibold text-ink">{formatarDataCalendario(lancamento.data)}</p>
        <p className="mt-1 text-muted">Dinheiro {formatarMoeda(lancamento.dinheiro)} · Pix {formatarMoeda(lancamento.pix)} · Cartões {formatarMoeda(lancamento.cartoes)}</p>
        <p className="mt-2 font-semibold text-ink">Total {formatarMoeda(lancamento.total)}</p>
      </div>
      <p className="mt-4 text-sm text-ink">Os valores deste dia serão apagados. Não dá para desfazer.</p>
      {erro && <p role="alert" className="mt-3 text-sm text-danger">{erro}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variante="secundaria" onClick={onFechar}>Não, manter</Button>
        <Button type="button" variante="perigo" disabled={excluindo} onClick={excluir}><IconeLixeira tamanho={16} />{excluindo ? "Excluindo..." : "Sim, excluir"}</Button>
      </div>
    </Modal>
  );
}
