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
  ceasa: number;
  /** entradas lançadas à mão: dinheiro + Pix + cartões + CEASA */
  total: number;
  /** gastos / sangrias do dia (saem do caixa) */
  gastos: number;
  gastosDescricao: string | null;
  observacoes: string | null;
}

/** Comandas do sistema entregues/concluídas no dia (pedidos delivery e balcão). */
interface PedidosDoDiaCaixa {
  data: string;
  quantidade: number;
  total: number;
  pedidos: { id: string; numero: string; cliente: string; tipoEntrega: string; total: number; entregueEm: string }[];
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const FORMAS = [
  { chave: "dinheiro", rotulo: "Dinheiro", icone: "💵" },
  { chave: "pix", rotulo: "Pix", icone: "⚡" },
  { chave: "cartoes", rotulo: "Cartões", icone: "💳" },
  { chave: "ceasa", rotulo: "CEASA", icone: "🥬" },
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
  const [entregues, setEntregues] = useState<PedidosDoDiaCaixa[]>([]);
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
      const [manuais, pedidosEntregues] = await Promise.all([
        api<LancamentoCaixa[]>(`/caixa/lancamentos?mes=${chaveMes}`),
        api<PedidosDoDiaCaixa[]>(`/caixa/pedidos-entregues?mes=${chaveMes}`),
      ]);
      setLancamentos(manuais);
      setEntregues(pedidosEntregues);
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
  const pedidosPorDia = useMemo(() => new Map(entregues.map((d) => [d.data, d])), [entregues]);

  const totaisMes = useMemo(
    () =>
      lancamentos.reduce(
        (soma, l) => ({ ...soma, dinheiro: soma.dinheiro + l.dinheiro, pix: soma.pix + l.pix, cartoes: soma.cartoes + l.cartoes, ceasa: soma.ceasa + l.ceasa, gastos: soma.gastos + l.gastos, total: soma.total + l.total }),
        { dinheiro: 0, pix: 0, cartoes: 0, ceasa: 0, gastos: 0, pedidos: entregues.reduce((soma, d) => soma + d.total, 0), total: entregues.reduce((soma, d) => soma + d.total, 0) }
      ),
    [lancamentos, entregues]
  );
  const quantidadePedidosMes = entregues.reduce((soma, d) => soma + d.quantidade, 0);

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
  const pedidosDoDia = pedidosPorDia.get(diaSelecionado);
  const diaFuturo = diaSelecionado > hoje;

  return (
    <section aria-labelledby="titulo-lancamentos-caixa" className="flex flex-col gap-4 border-t-2 border-dashed border-border pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="titulo-lancamentos-caixa" className="font-display text-2xl uppercase text-ink sm:text-3xl">Lançamentos do caixa da loja</h2>
          <p className="mt-1 text-sm text-muted">Dinheiro, Pix, cartões e CEASA (lançados à mão) + pedidos delivery entregues no sistema (somados sozinhos), menos os gastos/sangrias do dia. Escolha o dia no calendário.</p>
        </div>
        <Button tamanho="grande" className="shrink-0 whitespace-nowrap" onClick={() => {
            const dia = diaFuturo ? hoje : diaSelecionado;
            setFormulario({ lancamento: porDia.get(dia), data: dia });
          }}>
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
            <div className="rounded-lg bg-primary/[0.06] px-3 py-2.5">
              <p className="text-xs text-muted">🛵 Pedidos delivery no mês</p>
              <p className="whitespace-nowrap font-display text-lg text-ink sm:text-xl">{formatarMoeda(totaisMes.pedidos)}</p>
              <p className="text-[11px] text-muted">{quantidadePedidosMes} {quantidadePedidosMes === 1 ? "comanda entregue" : "comandas entregues"}</p>
            </div>
            <div className="rounded-lg bg-danger/[0.07] px-3 py-2.5">
              <p className="text-xs text-muted">🔻 Gastos / sangrias</p>
              <p className="whitespace-nowrap font-display text-lg text-danger sm:text-xl">− {formatarMoeda(totaisMes.gastos)}</p>
            </div>
            <div className="rounded-lg bg-success/[0.09] px-3 py-2.5">
              <p className="text-xs text-muted">Total de entradas</p>
              <p className="whitespace-nowrap font-display text-lg text-success sm:text-xl">{formatarMoeda(totaisMes.total)}</p>
            </div>
            <div className="col-span-2 rounded-lg bg-ink px-3 py-2.5 text-white sm:col-span-4">
              <p className="text-xs text-white/70">Saldo do mês (entradas − gastos)</p>
              <p className="whitespace-nowrap font-display text-xl sm:text-2xl">{formatarMoeda(totaisMes.total - totaisMes.gastos)}</p>
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
              const pedidosDia = pedidosPorDia.get(dia);
              const totalGeral = (lancamento?.total ?? 0) + (pedidosDia?.total ?? 0);
              const futuro = dia > hoje;
              const selecionado = dia === diaSelecionado;
              const faltando = !lancamento && !futuro;
              const cor = lancamento ? "border-success/40 bg-success/[0.07]" : pedidosDia ? "border-gold/50 bg-gold/[0.08]" : futuro ? "border-border/60 bg-background/60" : "border-border bg-white";
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => escolherDia(dia)}
                  aria-pressed={selecionado}
                  aria-label={`Dia ${Number(dia.slice(8))}: ${totalGeral > 0 ? `total geral ${formatarMoeda(totalGeral)}${lancamento ? "" : ", caixa da loja não lançado"}` : futuro ? "ainda não chegou" : "sem lançamento"}`}
                  className={`flex min-h-[3.75rem] flex-col items-stretch rounded-lg border p-1 text-left transition sm:min-h-[5.5rem] sm:p-2 ${cor} ${selecionado ? "ring-2 ring-ink ring-offset-1" : "hover:border-ink/40"}`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-bold sm:text-sm ${dia === hoje ? "bg-primary text-white" : futuro ? "text-muted" : "text-ink"}`}>{Number(dia.slice(8))}</span>
                  {totalGeral > 0 && <span className={`mt-auto truncate text-[10px] font-bold leading-tight sm:text-xs xl:hidden ${lancamento ? "text-success" : "text-gold-texto"}`}>{moedaCurta(totalGeral)}</span>}
                  {totalGeral > 0 && <span className={`mt-auto hidden whitespace-nowrap text-sm font-bold xl:block ${lancamento ? "text-success" : "text-gold-texto"}`}>{formatarMoeda(totalGeral)}</span>}
                  {pedidosDia && <span className="hidden truncate text-[11px] text-muted sm:block">🛵 {pedidosDia.quantidade} {pedidosDia.quantidade === 1 ? "pedido" : "pedidos"}</span>}
                  {faltando && !pedidosDia && <span className="mt-auto hidden text-[11px] text-muted sm:block">sem lançamento</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-success/30" />Caixa lançado</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-gold/60 bg-gold/20" />Só pedidos (falta lançar o caixa)</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-border bg-white" />Sem lançamento</span>
            <span className="xl:hidden">Valores em reais · toque no dia para ver</span>
          </div>
        </Card>

        <div ref={detalheRef} className="h-fit scroll-mt-4 2xl:sticky 2xl:top-4">
          <Card>
            <p className="border-b border-border pb-3 font-display text-xl uppercase text-ink">{diaPorExtenso(diaSelecionado)}</p>
            {diaFuturo ? (
              <p className="py-6 text-center text-sm text-muted">Este dia ainda não chegou.</p>
            ) : (
              <>
                {lancamentoDoDia ? (
                  <ul className="divide-y divide-border">
                    {FORMAS.map((forma) => (
                      <li key={forma.chave} className="flex items-center justify-between py-3">
                        <span className="text-ink">{forma.icone} {forma.rotulo}</span>
                        <strong className="text-ink">{formatarMoeda(lancamentoDoDia[forma.chave])}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-gold/60 bg-gold/[0.07] p-3">
                    <p className="text-sm text-ink">Dinheiro, Pix, cartões, CEASA e gastos ainda não foram lançados neste dia.</p>
                    <Button className="mt-3 w-full" onClick={() => setFormulario({ data: diaSelecionado })}><IconeMais tamanho={18} />Inserir dados deste dia</Button>
                  </div>
                )}

                <div className="mt-1 border-t border-border py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-ink">🛵 Pedidos delivery <span className="text-xs text-muted">({pedidosDoDia?.quantidade ?? 0} {pedidosDoDia?.quantidade === 1 ? "entregue" : "entregues"})</span></span>
                    <strong className="text-ink">{formatarMoeda(pedidosDoDia?.total ?? 0)}</strong>
                  </div>
                  {pedidosDoDia && pedidosDoDia.pedidos.length > 0 && (
                    <details className="mt-2 rounded-lg bg-background px-3 py-2 text-sm">
                      <summary className="cursor-pointer font-semibold text-primary">Ver comandas</summary>
                      <ul className="mt-2 divide-y divide-border">
                        {pedidosDoDia.pedidos.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                            <span className="min-w-0 truncate text-ink"><strong>{p.numero.slice(-6)}</strong> · {p.cliente} <span className="text-xs text-muted">· {p.tipoEntrega === "DELIVERY" ? "entrega" : "retirada"}</span></span>
                            <span className="whitespace-nowrap font-semibold text-ink">{formatarMoeda(p.total)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="mt-1 text-xs text-muted">Comandas do sistema entregues e concluídas neste dia (somado automaticamente).</p>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-success/[0.09] px-3 py-3">
                  <span className="font-semibold text-ink">Total de entradas</span>
                  <span className="font-display text-2xl text-success">{formatarMoeda((lancamentoDoDia?.total ?? 0) + (pedidosDoDia?.total ?? 0))}</span>
                </div>
                {!!lancamentoDoDia?.gastos && (
                  <div className="mt-2 rounded-lg bg-danger/[0.07] px-3 py-3">
                    <div className="flex items-center justify-between"><span className="font-semibold text-ink">🔻 Gastos / sangrias</span><span className="font-display text-xl text-danger">− {formatarMoeda(lancamentoDoDia.gastos)}</span></div>
                    {lancamentoDoDia.gastosDescricao && <p className="mt-1 text-sm text-ink">{lancamentoDoDia.gastosDescricao}</p>}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between rounded-lg bg-ink px-3 py-3 text-white">
                  <span className="font-semibold">Saldo do dia</span>
                  <span className="font-display text-2xl">{formatarMoeda((lancamentoDoDia?.total ?? 0) + (pedidosDoDia?.total ?? 0) - (lancamentoDoDia?.gastos ?? 0))}</span>
                </div>
                {lancamentoDoDia?.observacoes && <p className="mt-3 rounded-lg bg-background px-3 py-2 text-sm text-ink">{lancamentoDoDia.observacoes}</p>}
                {lancamentoDoDia && (
                  <div className="mt-4 flex gap-2">
                    <Button variante="secundaria" className="flex-1" onClick={() => setFormulario({ lancamento: lancamentoDoDia, data: lancamentoDoDia.data })}><IconeLapis tamanho={16} />Alterar</Button>
                    <Button variante="secundaria" className="flex-1 !text-danger hover:!bg-danger/5" onClick={() => setExclusao(lancamentoDoDia)}><IconeLixeira tamanho={16} />Excluir</Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      {formulario && (
        <ModalLancamento
          inicial={formulario}
          diasLancados={porDia}
          pedidosPorDia={pedidosPorDia}
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
  pedidosPorDia,
  onFechar,
  onSalvo,
}: {
  inicial: { lancamento?: LancamentoCaixa; data: string };
  diasLancados: Map<string, LancamentoCaixa>;
  pedidosPorDia: Map<string, PedidosDoDiaCaixa>;
  onFechar: () => void;
  onSalvo: (salvo: LancamentoCaixa, idAnterior?: string) => void;
}) {
  const textoInicial = (valor?: number) => (valor ? String(valor) : "");
  // Lançamento que está sendo alterado. Se escolher um dia que já tem lançamento,
  // o formulário passa a alterar aquele dia (em vez de bloquear).
  const [editando, setEditando] = useState<LancamentoCaixa | undefined>(inicial.lancamento);
  const [carregadoDoDia, setCarregadoDoDia] = useState(false);
  const [data, setData] = useState(inicial.data);
  const [valores, setValores] = useState({
    dinheiro: textoInicial(inicial.lancamento?.dinheiro),
    pix: textoInicial(inicial.lancamento?.pix),
    cartoes: textoInicial(inicial.lancamento?.cartoes),
    ceasa: textoInicial(inicial.lancamento?.ceasa),
  });
  const [gastos, setGastos] = useState(textoInicial(inicial.lancamento?.gastos));
  const [gastosDescricao, setGastosDescricao] = useState(inicial.lancamento?.gastosDescricao ?? "");
  const [observacoes, setObservacoes] = useState(inicial.lancamento?.observacoes ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [procurandoDia, setProcurandoDia] = useState(false);
  // Pedidos entregues de dias fora do mês aberto no calendário
  const [pedidosOutroMes, setPedidosOutroMes] = useState<Map<string, PedidosDoDiaCaixa>>(new Map());

  function preencher(l?: LancamentoCaixa) {
    setValores({ dinheiro: textoInicial(l?.dinheiro), pix: textoInicial(l?.pix), cartoes: textoInicial(l?.cartoes), ceasa: textoInicial(l?.ceasa) });
    setGastos(textoInicial(l?.gastos));
    setGastosDescricao(l?.gastosDescricao ?? "");
    setObservacoes(l?.observacoes ?? "");
  }

  async function trocarDia(novaData: string) {
    setData(novaData);
    setErro("");
    // Procura se o dia já tem lançamento (no mês carregado ou buscando o mês do dia)
    let doDia = diasLancados.get(novaData);
    if (!doDia) {
      setProcurandoDia(true);
      try {
        const [doMes, entreguesDoMes] = await Promise.all([
          api<LancamentoCaixa[]>(`/caixa/lancamentos?mes=${novaData.slice(0, 7)}`),
          pedidosPorDia.has(novaData) ? Promise.resolve(null) : api<PedidosDoDiaCaixa[]>(`/caixa/pedidos-entregues?mes=${novaData.slice(0, 7)}`),
        ]);
        doDia = doMes.find((l) => l.data === novaData);
        if (entreguesDoMes) setPedidosOutroMes(new Map(entreguesDoMes.map((d) => [d.data, d])));
      } catch {
        // sem conexão: segue como dia novo; o servidor avisa se já existir
      } finally {
        setProcurandoDia(false);
      }
    }
    if (doDia && doDia.id !== editando?.id) {
      setEditando(doDia);
      setCarregadoDoDia(true);
      preencher(doDia);
    } else if (!doDia && carregadoDoDia) {
      // saiu de um dia já lançado para um dia livre: volta a ser um lançamento novo
      setEditando(undefined);
      setCarregadoDoDia(false);
      preencher(undefined);
    }
  }

  const numero = (texto: string) => Number(texto.replace(",", ".")) || 0;
  const total = numero(valores.dinheiro) + numero(valores.pix) + numero(valores.cartoes) + numero(valores.ceasa);
  const totalGastos = numero(gastos);
  const pedidosInfo = pedidosPorDia.get(data) ?? pedidosOutroMes.get(data);
  const pedidosDia = pedidosInfo?.total ?? 0;
  const jaLancado = !!editando && editando.data === data;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    if (total <= 0 && totalGastos <= 0) return setErro("Informe pelo menos um valor.");
    setSalvando(true);
    const corpo = { data, dinheiro: numero(valores.dinheiro), pix: numero(valores.pix), cartoes: numero(valores.cartoes), ceasa: numero(valores.ceasa), gastos: totalGastos, gastosDescricao: gastosDescricao.trim() || null, observacoes: observacoes.trim() || null };
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
    <Modal titulo={editando ? "Alterar dados do caixa" : "Inserir dados do caixa"} onFechar={onFechar}>
      <form onSubmit={salvar} className="mt-4 flex flex-col gap-4">
        <Input label="Dia do caixa" type="date" value={data} max={dataLocalISO()} onChange={(e) => e.target.value && trocarDia(e.target.value)} required />
        {procurandoDia && <p className="-mt-2 text-xs text-muted">Verificando o dia...</p>}
        {jaLancado && !procurandoDia && <p className="-mt-2 rounded-lg bg-gold/15 px-3 py-2 text-sm text-ink">✏️ O dia {formatarDataCalendario(data)} já tem lançamento — você está <strong>alterando</strong> os valores dele.</p>}
        <p className="-mb-2 text-sm font-semibold text-ink">Entradas</p>
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          {FORMAS.map((forma) => (
            <Input
              key={forma.chave}
              label={`${forma.icone} ${forma.rotulo} (R$)`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0,00"
              className="w-full min-w-0"
              value={valores[forma.chave]}
              onChange={(e) => setValores((atual) => ({ ...atual, [forma.chave]: e.target.value }))}
            />
          ))}
        </div>
        <div className="rounded-lg border-2 border-danger/20 bg-danger/[0.04] p-3">
          <p className="text-sm font-semibold text-ink">🔻 Gastos do dia (sangrias)</p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
            <Input label="Valor (R$)" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0,00" className="w-full min-w-0" value={gastos} onChange={(e) => setGastos(e.target.value)} />
            <Input label="Com o quê? (opcional)" placeholder="Ex.: sangria R$ 200, gelo, frete" className="w-full min-w-0" value={gastosDescricao} onChange={(e) => setGastosDescricao(e.target.value)} />
          </div>
        </div>
        <div className="rounded-lg bg-background px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3"><span className="text-muted">Caixa da loja + CEASA</span><strong className="whitespace-nowrap text-ink">{formatarMoeda(total)}</strong></div>
          <div className="mt-1 flex items-center justify-between gap-3"><span className="text-muted">🛵 Pedidos delivery entregues ({pedidosInfo?.quantidade ?? 0}) · automático</span><strong className="whitespace-nowrap text-ink">{formatarMoeda(pedidosDia)}</strong></div>
          <div className="mt-1 flex items-center justify-between gap-3"><span className="text-muted">Gastos / sangrias</span><strong className="whitespace-nowrap text-danger">− {formatarMoeda(totalGastos)}</strong></div>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-ink px-4 py-3 text-white">
          <span className="font-semibold">Saldo do dia</span>
          <span className="font-display text-2xl">{formatarMoeda(total + pedidosDia - totalGastos)}</span>
        </div>
        <div>
          <label htmlFor="obs-caixa" className="text-sm font-medium text-ink">Observações (opcional)</label>
          <textarea id="obs-caixa" rows={2} maxLength={500} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: diferença no caixa..." className="mt-1.5 w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm outline-none focus:border-primary" />
        </div>
        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" tamanho="grande" disabled={salvando || procurandoDia}>{salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar lançamento"}</Button>
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
        <p className="mt-1 text-muted">Dinheiro {formatarMoeda(lancamento.dinheiro)} · Pix {formatarMoeda(lancamento.pix)} · Cartões {formatarMoeda(lancamento.cartoes)} · CEASA {formatarMoeda(lancamento.ceasa)}{lancamento.gastos ? ` · Gastos − ${formatarMoeda(lancamento.gastos)}` : ""}</p>
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
