import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { dataLocalISO, formatarData, formatarDataCalendario, formatarMoeda } from "../../lib/formatadores";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { IconeCalendario, IconeLapis, IconeLista, IconeLixeira, IconeSetaDir, IconeSetaEsq } from "../../components/ui/Icones";

interface ContaPagar {
  id: string;
  fornecedor: string;
  descricao: string;
  categoria: string;
  valor: string | number;
  valorPago: string | number;
  saldo: string | number;
  percentualPago: number;
  dataLancamento: string;
  vencimento: string;
  dataPagamento?: string | null;
  formaPagamento?: string | null;
  status: string;
  observacoes?: string | null;
}

const CATEGORIAS = ["Fornecedores", "Energia", "Água", "Aluguel", "Funcionários", "Impostos", "Manutenção", "Outros"];
const FORMAS_PAGAMENTO = ["Dinheiro", "Pix", "Débito", "Crédito", "Transferência", "Boleto", "Outros"];

function hojeISO() { return dataLocalISO(); }

/** Mesma regra do servidor: metade para cada data; o centavo que sobrar fica no 1º boleto. */
function dividirEmDuas(total: number): [number, number] {
  const centavos = Math.round(total * 100);
  const segunda = Math.floor(centavos / 2);
  return [(centavos - segunda) / 100, segunda / 100];
}

export function ContasPagar() {
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [busca, setBusca] = useState("");
  const [contaPagamento, setContaPagamento] = useState<ContaPagar | null>(null);
  const [contaEdicao, setContaEdicao] = useState<ContaPagar | null>(null);
  const [contaExclusao, setContaExclusao] = useState<ContaPagar | null>(null);
  const [visao, setVisao] = useState<"lista" | "calendario">("lista");
  const [erro, setErro] = useState("");

  async function carregar() {
    try { setContas(await api<ContaPagar[]>("/contas-pagar")); setErro(""); }
    catch (e) { setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as contas."); }
  }

  useEffect(() => { carregar(); }, []);

  const visiveis = useMemo(() => contas.filter((conta) => {
    const texto = `${conta.fornecedor} ${conta.descricao} ${conta.categoria}`.toLowerCase();
    return (filtroStatus === "TODOS" || conta.status === filtroStatus)
      && (filtroCategoria === "TODAS" || conta.categoria === filtroCategoria)
      && texto.includes(busca.toLowerCase());
  }), [busca, contas, filtroCategoria, filtroStatus]);

  const resumo = useMemo(() => ({
    total: visiveis.reduce((soma, conta) => soma + Number(conta.valor), 0),
    pago: visiveis.reduce((soma, conta) => soma + Number(conta.valorPago || 0), 0),
    aberto: visiveis.reduce((soma, conta) => soma + Number(conta.saldo ?? Number(conta.valor) - Number(conta.valorPago || 0)), 0),
    vencidas: visiveis.filter((conta) => conta.status === "VENCIDO").length,
  }), [visiveis]);

  function atualizarConta(atualizada: ContaPagar) {
    setContas((atuais) => atuais.map((conta) => conta.id === atualizada.id ? { ...conta, ...atualizada } : conta));
    setContaPagamento(null);
    setContaEdicao(null);
    // Status "vencido" é calculado no servidor: recarrega para manter tudo certo
    carregar();
  }

  // Calendário usa a busca e a categoria, mas mostra todos os status (menos cancelada)
  const doCalendario = useMemo(() => contas.filter((conta) => {
    const texto = `${conta.fornecedor} ${conta.descricao} ${conta.categoria}`.toLowerCase();
    return conta.status !== "CANCELADO"
      && (filtroCategoria === "TODAS" || conta.categoria === filtroCategoria)
      && texto.includes(busca.toLowerCase());
  }), [busca, contas, filtroCategoria]);

  const acoes = {
    onPagar: (conta: ContaPagar) => setContaPagamento(conta),
    onAlterar: (conta: ContaPagar) => setContaEdicao(conta),
    onExcluir: (conta: ContaPagar) => setContaExclusao(conta),
  };

  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <p className="text-muted text-sm">Controle financeiro · {visao === "lista" ? `${visiveis.length} lançamento(s) visível(is)` : "contas por dia de vencimento"}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div role="tablist" aria-label="Forma de ver as contas" className="grid grid-cols-2 rounded-xl border border-border bg-white p-1">
          <button type="button" role="tab" aria-selected={visao === "lista"} onClick={() => setVisao("lista")} className={`flex h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${visao === "lista" ? "bg-ink text-white" : "text-ink hover:bg-background"}`}><IconeLista tamanho={18} />Lista</button>
          <button type="button" role="tab" aria-selected={visao === "calendario"} onClick={() => setVisao("calendario")} className={`flex h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${visao === "calendario" ? "bg-ink text-white" : "text-ink hover:bg-background"}`}><IconeCalendario tamanho={18} />Calendário</button>
        </div>
        <Button tamanho="grande" onClick={() => setMostrarFormulario(true)}>Nova conta a pagar</Button>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Resumo titulo="Total lançado" valor={formatarMoeda(resumo.total)} /><Resumo titulo="Já pago" valor={formatarMoeda(resumo.pago)} /><Resumo titulo="Saldo em aberto" valor={formatarMoeda(resumo.aberto)} /><Resumo titulo="Vencidas" valor={String(resumo.vencidas)} alerta={resumo.vencidas > 0} /></div>
    {mostrarFormulario && <FormularioContaPagar onCancelar={() => setMostrarFormulario(false)} onCriado={() => { setMostrarFormulario(false); carregar(); }} />}
    <Card><div className={`grid grid-cols-1 gap-3 ${visao === "lista" ? "md:grid-cols-[1fr_190px_190px]" : "md:grid-cols-[1fr_190px]"}`}><Input placeholder="Buscar fornecedor, descrição ou categoria..." value={busca} onChange={(e) => setBusca(e.target.value)} /><select aria-label="Filtrar por status" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className={`h-11 rounded-lg border border-border bg-white px-3.5 text-sm ${visao === "lista" ? "" : "hidden"}`}><option value="TODOS">Todos os status</option><option value="PENDENTE">Pendentes</option><option value="PARCIAL">Parciais</option><option value="VENCIDO">Vencidas</option><option value="PAGO">Pagas</option><option value="CANCELADO">Canceladas</option></select><select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="TODAS">Todas as categorias</option>{CATEGORIAS.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}</select></div></Card>
    {erro && <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}
    {visao === "calendario" && <CalendarioContas contas={doCalendario} {...acoes} />}
    {visao === "lista" && <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{visiveis.map((conta) => <CartaoConta key={conta.id} conta={conta} onPagar={() => acoes.onPagar(conta)} onAlterar={() => acoes.onAlterar(conta)} onExcluir={() => acoes.onExcluir(conta)} />)}</div>}
    {visao === "lista" && visiveis.length === 0 && <Card className="text-center py-12"><p className="font-display text-2xl uppercase text-ink">Nenhuma conta encontrada</p><p className="text-muted text-sm mt-2">Ajuste os filtros ou lance uma nova conta.</p></Card>}
    {contaPagamento && <ModalPagamento conta={contaPagamento} onFechar={() => setContaPagamento(null)} onAtualizado={atualizarConta} />}
    {contaEdicao && <ModalAlterarConta conta={contaEdicao} onFechar={() => setContaEdicao(null)} onAtualizado={atualizarConta} />}
    {contaExclusao && <ModalExcluirConta conta={contaExclusao} onFechar={() => setContaExclusao(null)} onExcluido={() => { setContas((atuais) => atuais.filter((c) => c.id !== contaExclusao.id)); setContaExclusao(null); }} />}
  </div>;
}

function Resumo({ titulo, valor, alerta = false }: { titulo: string; valor: string; alerta?: boolean }) { return <Card className={alerta ? "border-danger/30" : ""}><p className="text-xs text-muted">{titulo}</p><p className={`font-display text-2xl mt-1 ${alerta ? "text-danger" : "text-ink"}`}>{valor}</p></Card>; }
function Info({ label, valor }: { label: string; valor: string }) { return <div><p className="text-xs text-muted">{label}</p><p className="font-semibold text-ink mt-1">{valor}</p></div>; }

function CartaoConta({ conta, onPagar, onAlterar, onExcluir }: { conta: ContaPagar; onPagar: () => void; onAlterar: () => void; onExcluir: () => void }) {
  const paga = conta.status === "PAGO"; const cancelada = conta.status === "CANCELADO"; const saldo = conta.saldo ?? Number(conta.valor) - Number(conta.valorPago || 0);
  return <Card className={cancelada ? "opacity-60" : ""}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-display text-xl uppercase text-ink">{conta.fornecedor}</p><StatusBadge status={conta.status} /></div><p className="text-sm text-ink mt-1">{conta.descricao}</p><p className="text-xs text-muted mt-1">{conta.categoria}</p></div><div className="sm:text-right"><p className="text-xs text-muted">Valor da conta</p><p className="font-display text-2xl text-ink">{formatarMoeda(conta.valor)}</p></div></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm md:grid-cols-4"><Info label="Lançamento" valor={formatarDataCalendario(conta.dataLancamento)} /><Info label="Vencimento" valor={formatarDataCalendario(conta.vencimento)} /><Info label="Pago" valor={formatarMoeda(conta.valorPago || 0)} /><Info label="Saldo" valor={formatarMoeda(saldo)} /></div>{(conta.dataPagamento || conta.formaPagamento || conta.observacoes) && <div className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-muted">{conta.dataPagamento && `Último pagamento: ${formatarData(conta.dataPagamento)}`}{conta.formaPagamento && ` · ${conta.formaPagamento}`}{conta.observacoes && <span className="block mt-1">Obs.: {conta.observacoes}</span>}</div>}<div className="mt-4 flex flex-wrap gap-2">{!paga && !cancelada && <Button className="w-full sm:w-auto" onClick={onPagar}>{Number(conta.valorPago || 0) > 0 ? "Registrar pagamento restante" : "Registrar pagamento"}</Button>}<Button variante="secundaria" className="flex-1 sm:flex-none" onClick={onAlterar}><IconeLapis tamanho={16} />Alterar</Button><Button variante="secundaria" className="flex-1 !text-danger hover:!bg-danger/5 sm:flex-none" onClick={onExcluir}><IconeLixeira tamanho={16} />Excluir</Button></div></Card>;
}

function FormularioContaPagar({ onCancelar, onCriado }: { onCancelar: () => void; onCriado: () => void }) {
  const [fornecedor, setFornecedor] = useState(""); const [descricao, setDescricao] = useState(""); const [categoria, setCategoria] = useState(CATEGORIAS[0]); const [valor, setValor] = useState(""); const [dataLancamento, setDataLancamento] = useState(hojeISO()); const [vencimento, setVencimento] = useState(""); const [dividido, setDividido] = useState(false); const [segundoVencimento, setSegundoVencimento] = useState(""); const [observacoes, setObservacoes] = useState(""); const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
  const parcelas = dividirEmDuas(Number(valor) || 0);
  async function aoEnviar(evento: FormEvent) { evento.preventDefault(); setErro(""); if (dividido && segundoVencimento <= vencimento) { setErro("A segunda data do boleto precisa ser depois da primeira."); return; } setEnviando(true); try { await api("/contas-pagar", { method: "POST", body: { fornecedor, descricao, categoria, valor: Number(valor), dataLancamento, vencimento, segundoVencimento: dividido ? segundoVencimento : undefined, observacoes: observacoes || undefined } }); onCriado(); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao lançar conta."); } finally { setEnviando(false); } }
  return <Card><div className="flex items-center justify-between mb-4"><div><p className="font-display text-2xl uppercase text-ink">Novo lançamento</p><p className="text-sm text-muted mt-1">Registre todos os dados para acompanhar o pagamento.</p></div><button type="button" onClick={onCancelar} className="text-2xl text-muted">×</button></div><form onSubmit={aoEnviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Input label="Fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} required /><Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} required /><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Categoria</label><select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm">{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></div><Input label="Valor total (R$)" type="number" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required /><Input label="Data do lançamento" type="date" value={dataLancamento} onChange={(e) => setDataLancamento(e.target.value)} required /><Input label={dividido ? "1ª data de vencimento" : "Data de vencimento"} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
<div className="sm:col-span-2">{!dividido ? <button type="button" onClick={() => setDividido(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 text-sm font-semibold text-primary hover:border-primary hover:bg-primary/5">+ Boleto dividido? Adicionar 2ª data</button> : <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink">Boleto dividido em 2</p><p className="text-xs text-muted mt-0.5">O valor total é dividido ao meio entre as duas datas.</p></div><button type="button" onClick={() => { setDividido(false); setSegundoVencimento(""); }} className="min-h-9 shrink-0 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-white hover:text-danger">Remover 2ª data</button></div><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><Input label="2ª data de vencimento" type="date" min={vencimento || undefined} value={segundoVencimento} onChange={(e) => setSegundoVencimento(e.target.value)} required /><div className="flex flex-col justify-end gap-1 rounded-lg bg-white px-3.5 py-2.5 text-sm"><p className="flex justify-between gap-2"><span className="text-muted">1º boleto{vencimento && ` · ${formatarDataCalendario(vencimento)}`}</span><strong className="text-ink">{formatarMoeda(parcelas[0])}</strong></p><p className="flex justify-between gap-2"><span className="text-muted">2º boleto{segundoVencimento && ` · ${formatarDataCalendario(segundoVencimento)}`}</span><strong className="text-ink">{formatarMoeda(parcelas[1])}</strong></p></div></div></div>}</div><div className="sm:col-span-2"><label className="text-sm font-medium text-ink">Observações</label><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Nota fiscal, centro de custo, detalhes..." className="mt-1.5 w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm outline-none focus:border-primary" /></div>{erro && <p className="text-sm text-danger sm:col-span-2">{erro}</p>}<div className="flex gap-2 sm:col-span-2"><Button type="button" variante="secundaria" onClick={onCancelar} className="flex-1">Cancelar</Button><Button type="submit" disabled={enviando} className="flex-1">{enviando ? "Salvando..." : dividido ? "Salvar os 2 boletos" : "Salvar lançamento"}</Button></div></form></Card>;
}

function ModalPagamento({ conta, onFechar, onAtualizado }: { conta: ContaPagar; onFechar: () => void; onAtualizado: (conta: ContaPagar) => void }) {
  const saldo = Number(conta.saldo ?? Number(conta.valor) - Number(conta.valorPago || 0)); const [valorPago, setValorPago] = useState(String(saldo)); const [formaPagamento, setFormaPagamento] = useState(FORMAS_PAGAMENTO[1]); const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
  async function salvar(evento: FormEvent) { evento.preventDefault(); setErro(""); setEnviando(true); try { const atualizada = await api<ContaPagar>(`/contas-pagar/${conta.id}/pagar`, { method: "PATCH", body: { valorPago: Number(valorPago), formaPagamento } }); onAtualizado(atualizada); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao registrar pagamento."); } finally { setEnviando(false); } }
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4"><Card className="w-full max-w-lg"><div className="flex items-start justify-between"><div><p className="font-display text-2xl uppercase text-ink">Registrar pagamento</p><p className="text-sm text-muted mt-1">{conta.fornecedor} · {conta.descricao}</p></div><button type="button" onClick={onFechar} className="text-2xl text-muted">×</button></div><div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-background p-4"><Info label="Valor total" valor={formatarMoeda(conta.valor)} /><Info label="Saldo atual" valor={formatarMoeda(saldo)} /></div><form onSubmit={salvar} className="mt-5 flex flex-col gap-4"><Input label="Valor pago agora (R$)" type="number" min="0.01" max={saldo} step="0.01" value={valorPago} onChange={(e) => setValorPago(e.target.value)} required /><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Forma de pagamento</label><select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm">{FORMAS_PAGAMENTO.map((forma) => <option key={forma}>{forma}</option>)}</select></div>{erro && <p className="text-sm text-danger">{erro}</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button><Button type="submit" disabled={enviando}>{enviando ? "Confirmando..." : "Confirmar pagamento"}</Button></div></form></Card></div>;
}

function ModalBase({ titulo, subtitulo, onFechar, children, largura = "max-w-lg" }: { titulo: string; subtitulo?: string; onFechar: () => void; children: React.ReactNode; largura?: string }) {
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:px-4" onClick={onFechar}>
    <Card className={`max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-b-card ${largura}`} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3"><div><p className="font-display text-2xl uppercase text-ink">{titulo}</p>{subtitulo && <p className="text-sm text-muted mt-1">{subtitulo}</p>}</div><button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 shrink-0 text-2xl text-muted">×</button></div>
      {children}
    </Card>
  </div>;
}

function ModalAlterarConta({ conta, onFechar, onAtualizado }: { conta: ContaPagar; onFechar: () => void; onAtualizado: (conta: ContaPagar) => void }) {
  const [fornecedor, setFornecedor] = useState(conta.fornecedor);
  const [descricao, setDescricao] = useState(conta.descricao);
  const [categoria, setCategoria] = useState(conta.categoria);
  const [valor, setValor] = useState(String(Number(conta.valor)));
  const [dataLancamento, setDataLancamento] = useState(conta.dataLancamento.slice(0, 10));
  const [vencimento, setVencimento] = useState(conta.vencimento.slice(0, 10));
  const [observacoes, setObservacoes] = useState(conta.observacoes ?? "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const jaPago = Number(conta.valorPago || 0);

  async function salvar(evento: FormEvent) {
    evento.preventDefault(); setErro(""); setEnviando(true);
    try {
      const atualizada = await api<ContaPagar>(`/contas-pagar/${conta.id}`, { method: "PUT", body: { fornecedor, descricao, categoria, valor: Number(valor), dataLancamento, vencimento, observacoes: observacoes || null } });
      onAtualizado(atualizada);
    } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao alterar a conta."); }
    finally { setEnviando(false); }
  }

  return <ModalBase titulo="Alterar conta" subtitulo={`${conta.fornecedor} · ${conta.descricao}`} onFechar={onFechar} largura="max-w-2xl">
    <form onSubmit={salvar} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input label="Fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} required />
      <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
      <div className="flex flex-col gap-1.5"><label htmlFor="alterar-categoria" className="text-sm font-medium text-ink">Tipo de conta (categoria)</label><select id="alterar-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm">{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></div>
      <Input label="Valor (R$)" type="number" min={Math.max(jaPago, 0.01)} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
      <Input label="Data do lançamento" type="date" value={dataLancamento} onChange={(e) => setDataLancamento(e.target.value)} required />
      <Input label="Data de vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
      <div className="sm:col-span-2"><label htmlFor="alterar-obs" className="text-sm font-medium text-ink">Observações</label><textarea id="alterar-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm outline-none focus:border-primary" /></div>
      {jaPago > 0 && <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted sm:col-span-2">Já foi pago {formatarMoeda(jaPago)} desta conta, então o valor não pode ficar menor que isso.</p>}
      {erro && <p role="alert" className="text-sm text-danger sm:col-span-2">{erro}</p>}
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end"><Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button><Button type="submit" disabled={enviando}>{enviando ? "Salvando..." : "Salvar alterações"}</Button></div>
    </form>
  </ModalBase>;
}

function ModalExcluirConta({ conta, onFechar, onExcluido }: { conta: ContaPagar; onFechar: () => void; onExcluido: () => void }) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const jaPago = Number(conta.valorPago || 0);

  async function excluir() {
    setErro(""); setEnviando(true);
    try { await api(`/contas-pagar/${conta.id}`, { method: "DELETE" }); onExcluido(); }
    catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao excluir a conta."); setEnviando(false); }
  }

  return <ModalBase titulo="Excluir conta?" onFechar={onFechar}>
    <div className="mt-4 rounded-lg bg-background p-4 text-sm">
      <p className="font-semibold text-ink">{conta.fornecedor}</p>
      <p className="text-muted">{conta.descricao} · {conta.categoria}</p>
      <p className="mt-2 text-ink">{formatarMoeda(conta.valor)} · vence {formatarDataCalendario(conta.vencimento)}</p>
    </div>
    <p className="mt-4 text-sm text-ink">A conta será apagada da lista e do calendário. Não dá para desfazer.</p>
    {jaPago > 0 && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">Atenção: já foi registrado pagamento de {formatarMoeda(jaPago)} nesta conta. Ele também sai dos totais.</p>}
    {erro && <p role="alert" className="mt-3 text-sm text-danger">{erro}</p>}
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variante="secundaria" onClick={onFechar}>Não, manter</Button><Button type="button" variante="perigo" disabled={enviando} onClick={excluir}><IconeLixeira tamanho={16} />{enviando ? "Excluindo..." : "Sim, excluir"}</Button></div>
  </ModalBase>;
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Valor curto para caber na célula do celular: 850 → "850", 1.225,18 → "1,2 mil". */
function moedaCurta(valor: number) {
  if (valor >= 1000) return `${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function saldoDe(conta: ContaPagar) { return Number(conta.saldo ?? Number(conta.valor) - Number(conta.valorPago || 0)); }

function CalendarioContas({ contas, onPagar, onAlterar, onExcluir }: { contas: ContaPagar[]; onPagar: (c: ContaPagar) => void; onAlterar: (c: ContaPagar) => void; onExcluir: (c: ContaPagar) => void }) {
  const hoje = dataLocalISO();
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)) - 1);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(hoje);

  const chaveMes = `${ano}-${String(mes + 1).padStart(2, "0")}`;

  const porDia = useMemo(() => {
    const mapa = new Map<string, ContaPagar[]>();
    for (const conta of contas) {
      const dia = conta.vencimento.slice(0, 10);
      if (!dia.startsWith(chaveMes)) continue;
      mapa.set(dia, [...(mapa.get(dia) ?? []), conta]);
    }
    return mapa;
  }, [contas, chaveMes]);

  const resumoMes = useMemo(() => {
    let aPagar = 0; let pago = 0; let vencido = 0; let quantidade = 0;
    porDia.forEach((lista) => lista.forEach((conta) => {
      quantidade += 1; pago += Number(conta.valorPago || 0);
      if (conta.status !== "PAGO") { aPagar += saldoDe(conta); if (conta.status === "VENCIDO") vencido += saldoDe(conta); }
    }));
    return { aPagar, pago, vencido, quantidade };
  }, [porDia]);

  const primeiroDiaSemana = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const celulas: (string | null)[] = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => `${chaveMes}-${String(i + 1).padStart(2, "0")}`)];
  while (celulas.length % 7 !== 0) celulas.push(null);

  function mudarMes(delta: number) {
    const novo = new Date(Date.UTC(ano, mes + delta, 1));
    setAno(novo.getUTCFullYear()); setMes(novo.getUTCMonth());
    const chave = `${novo.getUTCFullYear()}-${String(novo.getUTCMonth() + 1).padStart(2, "0")}`;
    setDiaSelecionado(hoje.startsWith(chave) ? hoje : null);
  }
  function irParaHoje() { setAno(Number(hoje.slice(0, 4))); setMes(Number(hoje.slice(5, 7)) - 1); setDiaSelecionado(hoje); }

  const detalheRef = useRef<HTMLDivElement>(null);
  function escolherDia(dia: string) {
    setDiaSelecionado(dia);
    // No celular/tablet a lista do dia fica abaixo do calendário: leva até ela
    if (window.innerWidth < 1024) setTimeout(() => detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const contasDoDia = diaSelecionado ? porDia.get(diaSelecionado) ?? [] : [];

  return <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_380px]">
    <Card padded={false} className="p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-background"><IconeSetaEsq /></button>
          <h2 className="min-w-[10.5rem] text-center font-display text-2xl uppercase text-ink" aria-live="polite">{MESES[mes]} {ano}</h2>
          <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border hover:bg-background"><IconeSetaDir /></button>
        </div>
        {!hoje.startsWith(chaveMes) && <Button variante="secundaria" onClick={irParaHoje}>Voltar para hoje</Button>}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:gap-3">
        <div className="rounded-lg bg-primary/[0.07] px-2 py-2.5"><p className="text-[11px] text-muted sm:text-xs">A pagar no mês</p><p className="whitespace-nowrap font-display text-base text-primary sm:text-xl">{formatarMoeda(resumoMes.aPagar)}</p></div>
        <div className="rounded-lg bg-success/[0.08] px-2 py-2.5"><p className="text-[11px] text-muted sm:text-xs">Já pago</p><p className="whitespace-nowrap font-display text-base text-success sm:text-xl">{formatarMoeda(resumoMes.pago)}</p></div>
        <div className="rounded-lg bg-background px-2 py-2.5"><p className="text-[11px] text-muted sm:text-xs">Contas no mês</p><p className="font-display text-base text-ink sm:text-xl">{resumoMes.quantidade}</p></div>
      </div>
      {resumoMes.vencido > 0 && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{formatarMoeda(resumoMes.vencido)} deste mês já venceu e não foi pago.</p>}

      <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5">
        {DIAS_SEMANA.map((d) => <div key={d} className="pb-1 text-center text-[11px] font-bold uppercase tracking-wide text-muted sm:text-xs">{d}</div>)}
        {celulas.map((dia, i) => {
          if (!dia) return <div key={`v${i}`} className="min-h-[3.75rem] sm:min-h-[6rem]" />;
          const lista = porDia.get(dia) ?? [];
          const pendentes = lista.filter((c) => c.status !== "PAGO");
          const aPagar = pendentes.reduce((soma, c) => soma + saldoDe(c), 0);
          const temVencida = lista.some((c) => c.status === "VENCIDO");
          const tudoPago = lista.length > 0 && pendentes.length === 0;
          const ehHoje = dia === hoje;
          const selecionado = dia === diaSelecionado;
          const cor = temVencida ? "border-danger bg-danger/[0.13]" : aPagar > 0 ? "border-primary/25 bg-primary/[0.04]" : tudoPago ? "border-success/30 bg-success/[0.05]" : "border-border bg-white";
          return <button key={dia} type="button" onClick={() => escolherDia(dia)} aria-pressed={selecionado} aria-label={`Dia ${Number(dia.slice(8))}: ${lista.length ? `${lista.length} conta(s), ${formatarMoeda(aPagar)} a pagar` : "sem contas"}`}
            className={`flex min-h-[3.75rem] flex-col items-stretch rounded-lg border p-1 text-left transition sm:min-h-[6rem] sm:p-2 ${cor} ${selecionado ? "ring-2 ring-ink ring-offset-1" : "hover:border-ink/40"}`}>
            <span className={`flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-bold sm:text-sm ${ehHoje ? "bg-primary text-white" : "text-ink"}`}>{Number(dia.slice(8))}</span>
            {aPagar > 0 && <span className={`mt-auto truncate text-[10px] font-bold leading-tight sm:text-xs xl:hidden ${temVencida ? "text-danger" : "text-primary"}`}>{moedaCurta(aPagar)}</span>}
            {aPagar > 0 && <span className={`mt-auto hidden whitespace-nowrap text-sm font-bold xl:block ${temVencida ? "text-danger" : "text-primary"}`}>{formatarMoeda(aPagar)}</span>}
            {tudoPago && <span className="mt-auto truncate text-[10px] font-semibold text-success sm:text-xs">✓ pago</span>}
            {lista.length > 0 && <span className="hidden text-[11px] text-muted sm:block">{lista.length} conta{lista.length > 1 ? "s" : ""}</span>}
          </button>;
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary/30" />A pagar</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-danger bg-danger/30" />Vencida</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-success/30" />Paga</span>
        <span className="xl:hidden">Valores em reais · toque no dia para ver as contas</span>
      </div>
    </Card>

    <div ref={detalheRef} className="h-fit scroll-mt-4 2xl:sticky 2xl:top-4"><Card>
      {!diaSelecionado ? <p className="py-6 text-center text-sm text-muted">Toque em um dia do calendário para ver as contas.</p> : <>
        <div className="flex items-baseline justify-between gap-2 border-b border-border pb-3">
          <p className="font-display text-xl uppercase text-ink">{new Date(`${diaSelecionado}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" })}</p>
          {contasDoDia.length > 0 && <p className="whitespace-nowrap font-display text-lg text-primary">{formatarMoeda(contasDoDia.filter((c) => c.status !== "PAGO").reduce((s, c) => s + saldoDe(c), 0))}</p>}
        </div>
        {contasDoDia.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhuma conta vence neste dia.</p>}
        <ul className="divide-y divide-border">
          {contasDoDia.map((conta) => {
            const paga = conta.status === "PAGO";
            return <li key={conta.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate font-semibold text-ink">{conta.fornecedor}</p><p className="truncate text-sm text-muted">{conta.descricao}</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><StatusBadge status={conta.status} /><span className="text-xs text-muted">{conta.categoria}</span></div></div>
                <div className="text-right"><p className="whitespace-nowrap font-bold text-ink">{formatarMoeda(paga ? conta.valor : saldoDe(conta))}</p>{!paga && Number(conta.valorPago || 0) > 0 && <p className="text-xs text-muted">de {formatarMoeda(conta.valor)}</p>}</div>
              </div>
              <div className="mt-2.5 flex gap-2">
                {!paga && <Button className="h-10 flex-1 px-3" onClick={() => onPagar(conta)}>Pagar</Button>}
                <Button variante="secundaria" className="h-10 flex-1 px-3" onClick={() => onAlterar(conta)}><IconeLapis tamanho={15} />Alterar</Button>
                <Button variante="secundaria" className="h-10 px-3 !text-danger" aria-label={`Excluir conta de ${conta.fornecedor}`} onClick={() => onExcluir(conta)}><IconeLixeira tamanho={16} /></Button>
              </div>
            </li>;
          })}
        </ul>
      </>}
    </Card></div>
  </div>;
}
