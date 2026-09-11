import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { formatarDataHora, formatarMoeda } from "../../lib/formatadores";
import { imprimirPedidoTermico } from "../../lib/impressao";
import { Pedido, StatusOperacaoPedido } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

const FLUXO: StatusOperacaoPedido[] = ["RECEBIDO", "EM_PREPARO", "EXPEDICAO", "PRONTO", "EM_ENTREGA", "ENTREGUE"];
const STATUS_CONFIG: Record<string, { titulo: string; descricao: string; fundo: string }> = {
  RECEBIDO: { titulo: "Recebidos", descricao: "Aguardando preparo", fundo: "bg-primary/10" },
  EM_PREPARO: { titulo: "Em preparo", descricao: "Cortes sendo feitos", fundo: "bg-gold/10" },
  EXPEDICAO: { titulo: "Expedição", descricao: "Embalagem e conferência", fundo: "bg-success/10" },
  PRONTO: { titulo: "Prontos", descricao: "Aguardando saída", fundo: "bg-success/10" },
  EM_ENTREGA: { titulo: "Em rota", descricao: "Saiu para o cliente", fundo: "bg-blue-100" },
  ENTREGUE: { titulo: "Entregues", descricao: "Finalizados hoje", fundo: "bg-black/5" },
};

function nomeDoCliente(pedido: Pedido) {
  return pedido.cliente?.nomeFantasia || pedido.cliente?.razaoSocial || pedido.cliente?.nome || "Consumidor final";
}

function nomeResponsavel(responsavel?: { nome: string } | null) {
  return responsavel?.nome || "Aguardando";
}

function rotuloUnidade(unidade?: string, fallback = "unidade") {
  const unidadeNormalizada = unidade?.toLowerCase();
  if (unidadeNormalizada === "kg") return "kg";
  if (unidadeNormalizada === "g") return "g";
  if (unidadeNormalizada === "peca" || unidadeNormalizada === "un") return "peça";
  if (unidadeNormalizada === "unidade") return "unidade";
  if (unidadeNormalizada === "outra") return "unidade";
  return fallback;
}

function prepararPedidoParaExibicao(pedido: Pedido): Pedido {
  return {
    ...pedido,
    itens: pedido.itens.map((item) => ({
      ...item,
      produto: item.produto ? { ...item.produto, unidadeMedida: rotuloUnidade(item.unidadePedido, item.produto.unidadeMedida) } : item.produto,
    })),
  };
}

function proximoStatus(status: string): StatusOperacaoPedido | null {
  const indice = FLUXO.indexOf(status as StatusOperacaoPedido);
  return indice >= 0 && indice < FLUXO.length - 1 ? FLUXO[indice + 1] : null;
}

export function PedidosDoDia() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState("TODOS");
  const [carregando, setCarregando] = useState(true);
  const [comandaAberta, setComandaAberta] = useState<Pedido | null>(null);
  const [erro, setErro] = useState("");

  const carregarPedidos = useCallback(async () => {
    try {
      const resposta = await api<Pedido[]>("/pedidos");
      setPedidos(resposta.map(prepararPedidoParaExibicao));
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar os pedidos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarPedidos();
    const intervalo = window.setInterval(carregarPedidos, 10000);
    return () => window.clearInterval(intervalo);
  }, [carregarPedidos]);

  const pedidosVisiveis = useMemo(() => filtro === "TODOS" ? pedidos : pedidos.filter((pedido) => (pedido.statusOperacao || "RECEBIDO") === filtro), [filtro, pedidos]);

  function atualizarPedidoNaLista(atualizado: Pedido) {
    const pedidoPreparado = prepararPedidoParaExibicao(atualizado);
    setPedidos((atuais) => atuais.map((pedido) => pedido.id === pedidoPreparado.id ? pedidoPreparado : pedido));
    setComandaAberta(pedidoPreparado);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-sm text-muted">Totem de produção · atualização automática a cada 10 segundos</p><h2 className="mt-1 font-display text-3xl uppercase tracking-wide text-ink">Pedidos do dia</h2><p className="mt-2 text-sm text-muted">Abra uma comanda para assumir um corte, registrar o peso real e finalizar a conferência.</p></div>
        <Link to="/pedidos/novo"><Button tamanho="grande" className="w-full xl:w-auto">Novo pedido</Button></Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"><Filtro titulo="Todos" quantidade={pedidos.length} ativo={filtro === "TODOS"} onClick={() => setFiltro("TODOS")} />{FLUXO.map((status) => <Filtro key={status} titulo={STATUS_CONFIG[status].titulo} quantidade={pedidos.filter((pedido) => (pedido.statusOperacao || "RECEBIDO") === status).length} ativo={filtro === status} onClick={() => setFiltro(status)} />)}</div>
      {erro && <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</div>}
      {carregando && <Card><p className="text-sm text-muted">Carregando comandas...</p></Card>}
      {!carregando && pedidosVisiveis.length === 0 && <Card className="py-12 text-center"><p className="font-display text-2xl uppercase tracking-wide text-ink">Nenhuma comanda aqui</p><p className="mt-2 text-sm text-muted">Os novos pedidos aparecerão automaticamente neste painel.</p></Card>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {pedidosVisiveis.map((pedido) => {
          const status = pedido.statusOperacao || "RECEBIDO";
          const config = STATUS_CONFIG[status] || STATUS_CONFIG.RECEBIDO;
          const cortesFeitos = pedido.itens.filter((item) => item.statusPreparo === "CORTADO").length;
          return <button key={pedido.id} type="button" onClick={() => setComandaAberta(pedido)} className="flex flex-col overflow-hidden rounded-card border border-border bg-surface text-left shadow-card transition hover:border-primary">
            <div className={`flex items-center justify-between px-5 py-4 ${config.fundo}`}><div><p className="font-display text-2xl tracking-wide text-ink">{pedido.numero}</p><p className="mt-0.5 text-xs text-muted">{formatarDataHora(pedido.criadoEm)}</p></div><StatusBadge status={status} /></div>
            <div className="flex-1 px-5 py-4"><div className="flex items-start justify-between gap-3 border-b border-border pb-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Cliente / restaurante</p><p className="mt-1 text-lg font-semibold text-ink">{nomeDoCliente(pedido)}</p></div><p className="whitespace-nowrap font-bold text-ink">{formatarMoeda(pedido.total)}</p></div><div className="mt-4 space-y-3">{pedido.itens.map((item) => <div key={item.id} className="rounded-lg border border-border bg-background/60 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink">{item.produto?.nome || "Carne / produto"}</p><p className="mt-1 text-xs text-muted">Solicitado: {Number(item.pesoOuQtd).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.produto?.unidadeMedida || "unidade"} · Real: {item.pesoReal == null ? "aguardando" : `${Number(item.pesoReal).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${item.produto?.unidadeMedida || "unidade"}`}</p></div><div className="text-right"><p className="text-xs text-muted">Subtotal</p><p className="font-semibold text-ink">{formatarMoeda(item.subtotal)}</p></div></div><div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs"><p className="text-muted">Preço: <strong className="text-ink">{formatarMoeda(item.precoUnitario)}/{item.produto?.unidadeMedida || "unid."}</strong></p><p className="text-muted">Corte: <strong className="text-ink">{item.statusPreparo === "CORTADO" ? "Pronto" : item.statusPreparo === "EM_CORTE" ? "Em andamento" : "Pendente"}</strong></p><p className="text-muted">Açougueiro: <strong className="text-ink">{nomeResponsavel(item.preparadoPor)}</strong></p><p className="text-muted">Conferiu: <strong className="text-ink">{nomeResponsavel(item.cortadoPor)}</strong></p></div></div>)}</div></div>
            <div className="flex items-center justify-between border-t border-border bg-background px-5 py-3"><span className="text-xs font-semibold text-muted">{cortesFeitos}/{pedido.itens.length} cortes confirmados</span><span className="text-sm font-semibold text-primary">Abrir comanda →</span></div>
          </button>;
        })}
      </div>
      {comandaAberta && <ModalComanda pedido={comandaAberta} onFechar={() => setComandaAberta(null)} onAtualizado={atualizarPedidoNaLista} />}
    </div>
  );
}

function Filtro({ titulo, quantidade, ativo, onClick }: { titulo: string; quantidade: number; ativo: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-card border p-3 text-left transition ${ativo ? "border-primary bg-primary text-white" : "border-border bg-surface hover:border-primary"}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-80">{titulo}</p><p className={`mt-1 font-display text-3xl ${ativo ? "text-white" : "text-ink"}`}>{quantidade}</p></button>;
}

function ModalComanda({ pedido, onFechar, onAtualizado }: { pedido: Pedido; onFechar: () => void; onAtualizado: (pedido: Pedido) => void }) {
  const { usuario } = useAuth();
  const [peso, setPeso] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState("");
  const [erro, setErro] = useState("");
  const [finalizacaoAberta, setFinalizacaoAberta] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const status = pedido.statusOperacao || "RECEBIDO";
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.RECEBIDO;
  const proximo = proximoStatus(status);
  const todosCortados = pedido.itens.length > 0 && pedido.itens.every((item) => item.statusPreparo === "CORTADO");
  const podeFinalizar = todosCortados && (status === "RECEBIDO" || status === "EM_PREPARO");
  const podeImprimir = ["EXPEDICAO", "PRONTO", "EM_ENTREGA", "ENTREGUE"].includes(status);

  async function imprimir() {
    setImprimindo(true);
    setErro("");
    try {
      await imprimirPedidoTermico(pedido.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a impressão.");
    } finally {
      setImprimindo(false);
    }
  }

  async function atualizarItem(itemId: string, statusPreparo: "PENDENTE" | "EM_CORTE" | "CORTADO") {
    const textoPeso = peso[itemId];
    const pesoReal = statusPreparo === "CORTADO" && textoPeso ? Number(textoPeso.replace(",", ".")) : undefined;
    if (statusPreparo === "CORTADO" && (!pesoReal || pesoReal <= 0)) return setErro("Informe o peso real antes de confirmar o corte.");
    setCarregando(itemId);
    setErro("");
    try {
      const atualizado = await api<Pedido>(`/pedidos/${pedido.id}/itens/${itemId}/preparo`, { method: "PATCH", body: { statusPreparo, pesoReal } });
      onAtualizado(atualizado);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível atualizar o corte.");
    } finally {
      setCarregando("");
    }
  }

  async function avancar() {
    if (!proximo || status === "EM_PREPARO") return;
    setCarregando("status");
    setErro("");
    try {
      const atualizado = await api<Pedido>(`/pedidos/${pedido.id}/status-operacao`, { method: "PATCH", body: { statusOperacao: proximo } });
      onAtualizado(atualizado);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível avançar a comanda.");
    } finally {
      setCarregando("");
    }
  }

  return <div className="fixed inset-0 z-40 overflow-y-auto bg-black/50 px-3 py-5 sm:px-6"><div className="mx-auto max-w-4xl overflow-hidden rounded-card bg-surface shadow-2xl"><div className={`flex items-start justify-between px-6 py-5 ${config.fundo}`}><div><p className="font-display text-3xl text-ink">Comanda {pedido.numero}</p><p className="mt-1 text-sm text-muted">{nomeDoCliente(pedido)} · {formatarDataHora(pedido.criadoEm)}</p></div><button type="button" onClick={onFechar} className="text-2xl text-muted hover:text-ink" aria-label="Fechar">×</button></div><div className="p-6"><div className="mb-5 rounded-lg border border-primary/20 bg-primary/5 p-4"><div className="flex flex-wrap items-center gap-3"><StatusBadge status={status} /><p className="text-sm text-ink">O primeiro açougueiro que iniciar um corte fica responsável por concluí-lo.</p></div></div><div className="space-y-3">{pedido.itens.map((item) => { const cortado = item.statusPreparo === "CORTADO"; const emCorte = item.statusPreparo === "EM_CORTE"; const outroAçougueiro = Boolean(emCorte && item.preparadoPor?.id && item.preparadoPor.id !== usuario?.id); const pesoAtual = Number(peso[item.id]?.replace(",", ".") || 0); const solicitado = Number(item.pesoOuQtd); const pesoFinal = Number(item.pesoReal ?? 0); const excedeu = item.produto?.tipoVenda === "PESO" && ((cortado ? pesoFinal : pesoAtual) > solicitado + 1); return <div key={item.id} className={`rounded-lg border p-4 ${cortado ? "border-success/30 bg-success/5" : emCorte ? "border-gold/40 bg-gold/5" : "border-border"}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-lg font-semibold text-ink">{item.produto?.nome || "Carne / produto"}</p><p className="text-sm text-muted">Solicitado: <strong className="text-ink">{solicitado.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.produto?.unidadeMedida || "unidade"}</strong> · Preço: {formatarMoeda(item.precoUnitario)}/{item.produto?.unidadeMedida || "unidade"}</p><p className="mt-1 text-xs text-muted">Responsável: <strong className="text-ink">{nomeResponsavel(item.preparadoPor)}</strong> · Conferiu: <strong className="text-ink">{nomeResponsavel(item.cortadoPor)}</strong></p></div><StatusBadge status={item.statusPreparo} /></div>{cortado ? <div className="mt-3 rounded-lg bg-white/70 p-3 text-sm"><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><p className="text-muted">Solicitado<strong className="block text-ink">{solicitado.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.produto?.unidadeMedida}</strong></p><p className="text-muted">Peso real<strong className="block text-success">{pesoFinal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.produto?.unidadeMedida}</strong></p><p className="text-muted">Subtotal<strong className="block text-ink">{formatarMoeda(item.subtotal)}</strong></p></div>{excedeu && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">Atenção: o peso real passou {((pesoFinal - solicitado).toLocaleString("pt-BR", { maximumFractionDigits: 3 }))} {item.produto?.unidadeMedida} do solicitado.</p>}<p className="mt-2 text-xs text-muted">Preparou: {nomeResponsavel(item.preparadoPor)} · Cortou: {nomeResponsavel(item.cortadoPor)}</p></div> : <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><Input label={emCorte ? "Peso real após o corte" : "Peso real (preencher ao terminar)"} type="number" step="0.001" placeholder={String(item.pesoOuQtd)} value={peso[item.id] || ""} disabled={outroAçougueiro} onChange={(e) => setPeso((atual) => ({ ...atual, [item.id]: e.target.value }))} /><Button variante={emCorte ? "primaria" : "secundaria"} disabled={carregando === item.id || outroAçougueiro} onClick={() => atualizarItem(item.id, emCorte ? "CORTADO" : "EM_CORTE")}>{carregando === item.id ? "Salvando..." : outroAçougueiro ? `Em corte por ${item.preparadoPor?.nome}` : emCorte ? "Confirmar corte" : "Iniciar meu corte"}</Button></div>}{!cortado && pesoAtual > solicitado + 1 && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">Atenção: este peso está mais de 1 {item.produto?.unidadeMedida} acima do solicitado.</p>}{cortado && <Button variante="fantasma" className="mt-2 px-0" disabled={item.preparadoPor?.id ? item.preparadoPor.id !== usuario?.id : false} onClick={() => atualizarItem(item.id, "EM_CORTE")}>Reabrir corte para corrigir peso</Button>}</div>; })}</div>{erro && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}{podeFinalizar && <div className="mt-6 rounded-lg border-2 border-primary/20 bg-primary/5 p-4"><p className="font-display text-2xl uppercase text-ink">Todos os cortes conferidos</p><p className="mt-1 text-sm text-muted">Revise os pesos reais e finalize a condição de pagamento para enviar à expedição.</p><Button className="mt-4 w-full" tamanho="grande" onClick={() => setFinalizacaoAberta(true)}>Conferir pedido e finalizar</Button></div>}<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><div className="flex flex-col gap-2 sm:flex-row"><Button variante="secundaria" onClick={onFechar}>Fechar</Button>{podeImprimir && <Button variante="secundaria" disabled={imprimindo} onClick={imprimir}>{imprimindo ? "Preparando impressão..." : "Imprimir nota térmica 58 mm"}</Button>}</div>{proximo && status !== "EM_PREPARO" && <Button tamanho="grande" disabled={carregando === "status"} onClick={avancar}>{carregando === "status" ? "Atualizando..." : `Enviar para ${STATUS_CONFIG[proximo].titulo.toLowerCase()}`}</Button>}</div></div></div>{finalizacaoAberta && <ModalFinalizacao pedido={pedido} onFechar={() => setFinalizacaoAberta(false)} onFinalizado={(atualizado) => { setFinalizacaoAberta(false); onAtualizado(atualizado); }} />}</div>;
}

function ModalFinalizacao({ pedido, onFechar, onFinalizado }: { pedido: Pedido; onFechar: () => void; onFinalizado: (pedido: Pedido) => void }) {
  const [forma, setForma] = useState("DINHEIRO");
  const [vencimento, setVencimento] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function confirmar() {
    setErro("");
    if (forma === "A_PRAZO" && !vencimento) return setErro("Informe a data para pagamento posterior.");
    setSalvando(true);
    try {
      const atualizado = await api<Pedido>(`/pedidos/${pedido.id}/finalizar-conferencia`, { method: "POST", body: { formaPagamento: forma, vencimento: forma === "A_PRAZO" ? vencimento : undefined } });
      onFinalizado(atualizado);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível finalizar a comanda.");
    } finally {
      setSalvando(false);
    }
  }
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-3 py-5 sm:px-6"><div className="mx-auto max-w-3xl overflow-hidden rounded-card bg-surface shadow-2xl"><div className="flex items-start justify-between bg-ink px-6 py-5 text-white"><div><p className="font-display text-3xl uppercase">Conferência final</p><p className="mt-1 text-sm text-white/70">Comanda {pedido.numero} · {nomeDoCliente(pedido)}</p></div><button type="button" onClick={onFechar} className="text-2xl text-white/70">×</button></div><div className="p-6"><p className="text-sm text-muted">Confira o que foi solicitado, o peso real de cada corte e o valor final da nota.</p><div className="mt-4 overflow-hidden rounded-lg border border-border"><div className="hidden grid-cols-5 gap-3 bg-background px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted sm:grid"><span>Carne</span><span>Solicitado</span><span>Peso real</span><span>Preço</span><span className="text-right">Subtotal</span></div><div className="divide-y divide-border">{pedido.itens.map((item) => { const solicitado = Number(item.pesoOuQtd); const real = Number(item.pesoReal ?? item.pesoOuQtd); const passou = item.produto?.tipoVenda === "PESO" && real > solicitado + 1; return <div key={item.id} className="grid grid-cols-2 gap-2 px-4 py-3 text-sm sm:grid-cols-5 sm:gap-3"><div><p className="font-semibold text-ink">{item.produto?.nome}</p><p className="text-xs text-muted sm:hidden">Solicitado: {solicitado} · Real: {real}</p></div><span className="hidden text-muted sm:block">{solicitado} {item.produto?.unidadeMedida}</span><span className={`hidden sm:block ${passou ? "font-bold text-danger" : "text-success"}`}>{real} {item.produto?.unidadeMedida}</span><span className="hidden text-muted sm:block">{formatarMoeda(item.precoUnitario)}/{item.produto?.unidadeMedida}</span><span className="col-span-2 text-right font-semibold text-ink sm:col-span-1">{formatarMoeda(item.subtotal)}</span>{passou && <p className="col-span-2 rounded bg-danger/10 px-2 py-1 text-xs font-semibold text-danger sm:col-span-5">Peso real acima do solicitado em {(real - solicitado).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.produto?.unidadeMedida}.</p>}</div>; })}<div className="flex items-center justify-between bg-background px-4 py-4"><span className="font-semibold text-ink">Valor final da nota</span><span className="font-display text-3xl text-gold">{formatarMoeda(pedido.total)}</span></div></div></div><div className="mt-6 rounded-lg border-2 border-primary/20 bg-primary/5 p-5"><p className="font-display text-2xl uppercase text-ink">Condição de pagamento</p><p className="mt-1 text-sm text-muted">Escolha como o cliente vai pagar esta comanda.</p><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><button type="button" onClick={() => setForma("DINHEIRO")} className={`rounded-lg border p-4 text-left ${forma !== "A_PRAZO" ? "border-primary bg-white" : "border-border bg-surface"}`}><p className="font-semibold text-ink">Pagamento à vista</p><p className="mt-1 text-xs text-muted">Receber agora</p></button><button type="button" onClick={() => setForma("A_PRAZO")} className={`rounded-lg border p-4 text-left ${forma === "A_PRAZO" ? "border-primary bg-white" : "border-border bg-surface"}`}><p className="font-semibold text-ink">Pagamento posterior</p><p className="mt-1 text-xs text-muted">Lançar em contas a receber</p></button></div>{forma !== "A_PRAZO" && <div className="mt-3"><label className="text-sm font-medium text-ink">Forma à vista</label><select value={forma} onChange={(e) => setForma(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm"><option value="DINHEIRO">Dinheiro</option><option value="PIX">Pix</option><option value="CARTAO_DEBITO">Cartão de débito</option><option value="CARTAO_CREDITO">Cartão de crédito</option><option value="TRANSFERENCIA">Transferência</option></select></div>}{forma === "A_PRAZO" && <div className="mt-3"><Input label="Data para pagamento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required /></div>}{erro && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}</div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variante="secundaria" onClick={onFechar}>Voltar para a comanda</Button><Button tamanho="grande" disabled={salvando} onClick={confirmar}>{salvando ? "Finalizando..." : "Finalizar e enviar para expedição"}</Button></div></div></div></div>;
}
