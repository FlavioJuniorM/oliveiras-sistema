import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { formatarData, formatarMoeda } from "../../lib/formatadores";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";

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

function hojeISO() { return new Date().toISOString().slice(0, 10); }

export function ContasPagar() {
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [busca, setBusca] = useState("");
  const [contaPagamento, setContaPagamento] = useState<ContaPagar | null>(null);
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
  }

  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-muted text-sm">Controle financeiro · {visiveis.length} lançamento(s) visível(is)</p><h2 className="font-display text-3xl uppercase tracking-wide text-ink mt-1">Contas a pagar</h2></div><Button tamanho="grande" onClick={() => setMostrarFormulario(true)}>Nova conta a pagar</Button></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Resumo titulo="Total lançado" valor={formatarMoeda(resumo.total)} /><Resumo titulo="Já pago" valor={formatarMoeda(resumo.pago)} /><Resumo titulo="Saldo em aberto" valor={formatarMoeda(resumo.aberto)} /><Resumo titulo="Vencidas" valor={String(resumo.vencidas)} alerta={resumo.vencidas > 0} /></div>
    {mostrarFormulario && <FormularioContaPagar onCancelar={() => setMostrarFormulario(false)} onCriado={() => { setMostrarFormulario(false); carregar(); }} />}
    <Card><div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_190px_190px]"><Input placeholder="Buscar fornecedor, descrição ou categoria..." value={busca} onChange={(e) => setBusca(e.target.value)} /><select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="TODOS">Todos os status</option><option value="PENDENTE">Pendentes</option><option value="PARCIAL">Parciais</option><option value="VENCIDO">Vencidas</option><option value="PAGO">Pagas</option><option value="CANCELADO">Canceladas</option></select><select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="TODAS">Todas as categorias</option>{CATEGORIAS.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}</select></div></Card>
    {erro && <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{visiveis.map((conta) => <CartaoConta key={conta.id} conta={conta} onPagar={() => setContaPagamento(conta)} />)}</div>
    {visiveis.length === 0 && <Card className="text-center py-12"><p className="font-display text-2xl uppercase text-ink">Nenhuma conta encontrada</p><p className="text-muted text-sm mt-2">Ajuste os filtros ou lance uma nova conta.</p></Card>}
    {contaPagamento && <ModalPagamento conta={contaPagamento} onFechar={() => setContaPagamento(null)} onAtualizado={atualizarConta} />}
  </div>;
}

function Resumo({ titulo, valor, alerta = false }: { titulo: string; valor: string; alerta?: boolean }) { return <Card className={alerta ? "border-danger/30" : ""}><p className="text-xs text-muted">{titulo}</p><p className={`font-display text-2xl mt-1 ${alerta ? "text-danger" : "text-ink"}`}>{valor}</p></Card>; }
function Info({ label, valor }: { label: string; valor: string }) { return <div><p className="text-xs text-muted">{label}</p><p className="font-semibold text-ink mt-1">{valor}</p></div>; }

function CartaoConta({ conta, onPagar }: { conta: ContaPagar; onPagar: () => void }) {
  const paga = conta.status === "PAGO"; const cancelada = conta.status === "CANCELADO"; const saldo = conta.saldo ?? Number(conta.valor) - Number(conta.valorPago || 0);
  return <Card className={cancelada ? "opacity-60" : ""}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-display text-xl uppercase text-ink">{conta.fornecedor}</p><StatusBadge status={conta.status} /></div><p className="text-sm text-ink mt-1">{conta.descricao}</p><p className="text-xs text-muted mt-1">{conta.categoria}</p></div><div className="sm:text-right"><p className="text-xs text-muted">Valor da conta</p><p className="font-display text-2xl text-ink">{formatarMoeda(conta.valor)}</p></div></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm md:grid-cols-4"><Info label="Lançamento" valor={formatarData(conta.dataLancamento)} /><Info label="Vencimento" valor={formatarData(conta.vencimento)} /><Info label="Pago" valor={formatarMoeda(conta.valorPago || 0)} /><Info label="Saldo" valor={formatarMoeda(saldo)} /></div>{(conta.dataPagamento || conta.formaPagamento || conta.observacoes) && <div className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-muted">{conta.dataPagamento && `Último pagamento: ${formatarData(conta.dataPagamento)}`}{conta.formaPagamento && ` · ${conta.formaPagamento}`}{conta.observacoes && <span className="block mt-1">Obs.: {conta.observacoes}</span>}</div>}{!paga && !cancelada && <Button className="mt-4 w-full sm:w-auto" onClick={onPagar}>{Number(conta.valorPago || 0) > 0 ? "Registrar pagamento restante" : "Registrar pagamento"}</Button>}</Card>;
}

function FormularioContaPagar({ onCancelar, onCriado }: { onCancelar: () => void; onCriado: () => void }) {
  const [fornecedor, setFornecedor] = useState(""); const [descricao, setDescricao] = useState(""); const [categoria, setCategoria] = useState(CATEGORIAS[0]); const [valor, setValor] = useState(""); const [dataLancamento, setDataLancamento] = useState(hojeISO()); const [vencimento, setVencimento] = useState(""); const [observacoes, setObservacoes] = useState(""); const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
  async function aoEnviar(evento: FormEvent) { evento.preventDefault(); setErro(""); setEnviando(true); try { await api("/contas-pagar", { method: "POST", body: { fornecedor, descricao, categoria, valor: Number(valor), dataLancamento, vencimento, observacoes: observacoes || undefined } }); onCriado(); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao lançar conta."); } finally { setEnviando(false); } }
  return <Card><div className="flex items-center justify-between mb-4"><div><p className="font-display text-2xl uppercase text-ink">Novo lançamento</p><p className="text-sm text-muted mt-1">Registre todos os dados para acompanhar o pagamento.</p></div><button type="button" onClick={onCancelar} className="text-2xl text-muted">×</button></div><form onSubmit={aoEnviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Input label="Fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} required /><Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} required /><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Categoria</label><select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm">{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></div><Input label="Valor total (R$)" type="number" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required /><Input label="Data do lançamento" type="date" value={dataLancamento} onChange={(e) => setDataLancamento(e.target.value)} required /><Input label="Data de vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required /><div className="sm:col-span-2"><label className="text-sm font-medium text-ink">Observações</label><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Nota fiscal, centro de custo, detalhes..." className="mt-1.5 w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm outline-none focus:border-primary" /></div>{erro && <p className="text-sm text-danger sm:col-span-2">{erro}</p>}<div className="flex gap-2 sm:col-span-2"><Button type="button" variante="secundaria" onClick={onCancelar} className="flex-1">Cancelar</Button><Button type="submit" disabled={enviando} className="flex-1">{enviando ? "Salvando..." : "Salvar lançamento"}</Button></div></form></Card>;
}

function ModalPagamento({ conta, onFechar, onAtualizado }: { conta: ContaPagar; onFechar: () => void; onAtualizado: (conta: ContaPagar) => void }) {
  const saldo = Number(conta.saldo ?? Number(conta.valor) - Number(conta.valorPago || 0)); const [valorPago, setValorPago] = useState(String(saldo)); const [formaPagamento, setFormaPagamento] = useState(FORMAS_PAGAMENTO[1]); const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false);
  async function salvar(evento: FormEvent) { evento.preventDefault(); setErro(""); setEnviando(true); try { const atualizada = await api<ContaPagar>(`/contas-pagar/${conta.id}/pagar`, { method: "PATCH", body: { valorPago: Number(valorPago), formaPagamento } }); onAtualizado(atualizada); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao registrar pagamento."); } finally { setEnviando(false); } }
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4"><Card className="w-full max-w-lg"><div className="flex items-start justify-between"><div><p className="font-display text-2xl uppercase text-ink">Registrar pagamento</p><p className="text-sm text-muted mt-1">{conta.fornecedor} · {conta.descricao}</p></div><button type="button" onClick={onFechar} className="text-2xl text-muted">×</button></div><div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-background p-4"><Info label="Valor total" valor={formatarMoeda(conta.valor)} /><Info label="Saldo atual" valor={formatarMoeda(saldo)} /></div><form onSubmit={salvar} className="mt-5 flex flex-col gap-4"><Input label="Valor pago agora (R$)" type="number" min="0.01" max={saldo} step="0.01" value={valorPago} onChange={(e) => setValorPago(e.target.value)} required /><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Forma de pagamento</label><select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm">{FORMAS_PAGAMENTO.map((forma) => <option key={forma}>{forma}</option>)}</select></div>{erro && <p className="text-sm text-danger">{erro}</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button><Button type="submit" disabled={enviando}>{enviando ? "Confirmando..." : "Confirmar pagamento"}</Button></div></form></Card></div>;
}
