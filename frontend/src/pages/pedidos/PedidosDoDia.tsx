import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { formatarDataHora, formatarMoeda } from "../../lib/formatadores";
import { Pedido, StatusOperacaoPedido } from "../../types";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

const FLUXO: StatusOperacaoPedido[] = ["RECEBIDO", "EM_PREPARO", "EXPEDICAO", "EM_ENTREGA", "ENTREGUE"];

const STATUS_CONFIG: Record<string, { titulo: string; descricao: string; cor: string; fundo: string }> = {
  RECEBIDO: { titulo: "Recebidos", descricao: "Aguardando preparo", cor: "text-primary", fundo: "bg-primary/10" },
  EM_PREPARO: { titulo: "Em preparo", descricao: "Cortes sendo feitos", cor: "text-gold", fundo: "bg-gold/10" },
  EXPEDICAO: { titulo: "Expedição", descricao: "Embalagem e conferência", cor: "text-success", fundo: "bg-success/10" },
  PRONTO: { titulo: "Prontos", descricao: "Aguardando retirada ou entrega", cor: "text-success", fundo: "bg-success/10" },
  EM_ENTREGA: { titulo: "Em rota", descricao: "Saiu para o cliente", cor: "text-blue-700", fundo: "bg-blue-100" },
  ENTREGUE: { titulo: "Entregues", descricao: "Finalizados hoje", cor: "text-muted", fundo: "bg-black/5" },
};

function nomeDoCliente(pedido: Pedido) {
  return pedido.cliente?.nomeFantasia || pedido.cliente?.razaoSocial || pedido.cliente?.nome || "Consumidor final";
}

function proximoStatus(status: string): StatusOperacaoPedido | null {
  if (status === "PRONTO") return "EM_ENTREGA";
  const indice = FLUXO.indexOf(status as StatusOperacaoPedido);
  return indice >= 0 && indice < FLUXO.length - 1 ? FLUXO[indice + 1] : null;
}

export function PedidosDoDia() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState<string>("TODOS");
  const [carregando, setCarregando] = useState(true);
  const [comandaAberta, setComandaAberta] = useState<Pedido | null>(null);
  const [erro, setErro] = useState("");

  const carregarPedidos = useCallback(async () => {
    try {
      setPedidos(await api<Pedido[]>("/pedidos"));
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

  const pedidosVisiveis = useMemo(
    () => (filtro === "TODOS" ? pedidos : pedidos.filter((pedido) => (pedido.statusOperacao || "RECEBIDO") === filtro)),
    [filtro, pedidos]
  );

  function atualizarPedidoNaLista(atualizado: Pedido) {
    setPedidos((atuais) => atuais.map((pedido) => (pedido.id === atualizado.id ? atualizado : pedido)));
    setComandaAberta(atualizado);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-muted text-sm">Painel de comandas · atualização automática a cada 10 segundos</p>
          <h2 className="font-display text-3xl uppercase tracking-wide text-ink mt-1">Acompanhe os pedidos</h2>
        </div>
        <Link to="/pedidos/novo"><Button tamanho="grande" className="w-full xl:w-auto">Novo pedido</Button></Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Filtro titulo="Todos" quantidade={pedidos.length} ativo={filtro === "TODOS"} onClick={() => setFiltro("TODOS")} />
        {FLUXO.map((status) => (
          <Filtro
            key={status}
            titulo={STATUS_CONFIG[status].titulo}
            quantidade={pedidos.filter((pedido) => (pedido.statusOperacao || "RECEBIDO") === status).length}
            ativo={filtro === status}
            onClick={() => setFiltro(status)}
          />
        ))}
      </div>

      {erro && <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</div>}
      {carregando && <Card><p className="text-muted text-sm">Carregando comandas...</p></Card>}
      {!carregando && pedidosVisiveis.length === 0 && (
        <Card className="text-center py-12">
          <p className="font-display text-2xl uppercase tracking-wide text-ink">Nenhuma comanda aqui</p>
          <p className="text-muted text-sm mt-2">Os novos pedidos aparecerão automaticamente neste painel.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {pedidosVisiveis.map((pedido) => {
          const status = pedido.statusOperacao || "RECEBIDO";
          const config = STATUS_CONFIG[status] || STATUS_CONFIG.RECEBIDO;
          const cortesFeitos = pedido.itens.filter((item) => item.statusPreparo === "CORTADO").length;
          return (
            <button
              key={pedido.id}
              type="button"
              onClick={() => setComandaAberta(pedido)}
              className="text-left bg-surface border border-border rounded-card shadow-card overflow-hidden hover:border-primary transition flex flex-col"
            >
              <div className={`flex items-center justify-between px-5 py-4 ${config.fundo}`}>
                <div>
                  <p className="font-display text-2xl tracking-wide text-ink">{pedido.numero}</p>
                  <p className="text-xs text-muted mt-0.5">{formatarDataHora(pedido.criadoEm)}</p>
                </div>
                <StatusBadge status={status} />
              </div>
              <div className="flex-1 px-5 py-4">
                <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cliente / restaurante</p>
                    <p className="font-semibold text-lg text-ink mt-1">{nomeDoCliente(pedido)}</p>
                  </div>
                  <p className="font-bold text-ink whitespace-nowrap">{formatarMoeda(pedido.total)}</p>
                </div>
                <div className="mt-4 space-y-3">
                  {pedido.itens.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <span className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-sm font-bold ${item.statusPreparo === "CORTADO" ? "bg-success/10 text-success" : "bg-background text-primary"}`}>
                          {Number(item.pesoReal ?? item.pesoOuQtd).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                        </span>
                        <div>
                          <p className="font-medium text-ink">{item.produto?.nome || "Carne / produto"}</p>
                          <p className="text-xs text-muted">{item.statusPreparo === "CORTADO" ? "Corte confirmado" : `Solicitado · ${item.produto?.unidadeMedida || "unidade"}`}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-ink">{formatarMoeda(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border bg-background px-5 py-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">{cortesFeitos}/{pedido.itens.length} cortes confirmados</span>
                <span className="text-sm font-semibold text-primary">Abrir comanda →</span>
              </div>
            </button>
          );
        })}
      </div>

      {comandaAberta && <ModalComanda pedido={comandaAberta} onFechar={() => setComandaAberta(null)} onAtualizado={atualizarPedidoNaLista} />}
    </div>
  );
}

function Filtro({ titulo, quantidade, ativo, onClick }: { titulo: string; quantidade: number; ativo: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-card border p-3 text-left transition ${ativo ? "border-primary bg-primary text-white" : "border-border bg-surface hover:border-primary"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{titulo}</p>
      <p className={`font-display text-3xl mt-1 ${ativo ? "text-white" : "text-ink"}`}>{quantidade}</p>
    </button>
  );
}

function ModalComanda({ pedido, onFechar, onAtualizado }: { pedido: Pedido; onFechar: () => void; onAtualizado: (pedido: Pedido) => void }) {
  const [peso, setPeso] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState("");
  const [erro, setErro] = useState("");
  const status = pedido.statusOperacao || "RECEBIDO";
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.RECEBIDO;
  const proximo = proximoStatus(status);

  async function atualizarItem(itemId: string, statusPreparo: "PENDENTE" | "EM_CORTE" | "CORTADO") {
    const textoPeso = peso[itemId];
    const pesoReal = textoPeso ? Number(textoPeso.replace(",", ".")) : undefined;
    if (statusPreparo === "CORTADO" && (!pesoReal || pesoReal <= 0)) {
      setErro("Informe o peso real de cada corte antes de confirmar.");
      return;
    }
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

  async function avançar() {
    if (!proximo) return;
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

  return (
    <div className="fixed inset-0 z-40 bg-black/50 px-3 py-5 sm:px-6 overflow-y-auto">
      <div className="mx-auto max-w-3xl rounded-card bg-surface shadow-2xl overflow-hidden">
        <div className={`flex items-start justify-between px-6 py-5 ${config.fundo}`}>
          <div><p className="font-display text-3xl text-ink">Comanda {pedido.numero}</p><p className="text-sm text-muted mt-1">{nomeDoCliente(pedido)} · {formatarDataHora(pedido.criadoEm)}</p></div>
          <button type="button" onClick={onFechar} className="text-2xl text-muted hover:text-ink" aria-label="Fechar">×</button>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-3 mb-5"><StatusBadge status={status} /><span className="text-sm text-muted">Clique em cada corte para registrar o preparo e o peso final.</span></div>
          <div className="space-y-3">
            {pedido.itens.map((item) => {
              const cortado = item.statusPreparo === "CORTADO";
              const emCorte = item.statusPreparo === "EM_CORTE";
              return (
                <div key={item.id} className={`rounded-lg border p-4 ${cortado ? "border-success/30 bg-success/5" : "border-border"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-semibold text-lg text-ink">{item.produto?.nome || "Carne / produto"}</p><p className="text-sm text-muted">Solicitado: {Number(item.pesoOuQtd).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.produto?.unidadeMedida || "unidade"}</p></div>
                    <StatusBadge status={item.statusPreparo} />
                  </div>
                  {cortado && <p className="mt-3 text-sm text-success font-semibold">Peso confirmado: {Number(item.pesoReal ?? item.pesoOuQtd).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.produto?.unidadeMedida || "unidade"}</p>}
                  {!cortado && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><Input label="Peso real após o corte" type="number" step="0.001" placeholder={String(item.pesoOuQtd)} value={peso[item.id] || ""} onChange={(e) => setPeso((atual) => ({ ...atual, [item.id]: e.target.value }))} /><Button variante={emCorte ? "primaria" : "secundaria"} disabled={carregando === item.id} onClick={() => atualizarItem(item.id, emCorte ? "CORTADO" : "EM_CORTE")}>{carregando === item.id ? "Salvando..." : emCorte ? "Confirmar corte" : "Iniciar corte"}</Button></div>}
                  {cortado && <Button variante="fantasma" className="mt-2 px-0" onClick={() => atualizarItem(item.id, "EM_CORTE")}>Reabrir corte para editar peso</Button>}
                </div>
              );
            })}
          </div>
          {erro && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button variante="secundaria" onClick={onFechar}>Fechar</Button>{proximo && <Button tamanho="grande" disabled={carregando === "status"} onClick={avançar}>{carregando === "status" ? "Atualizando..." : `Enviar para ${STATUS_CONFIG[proximo].titulo.toLowerCase()}`}</Button>}</div>
        </div>
      </div>
    </div>
  );
}
