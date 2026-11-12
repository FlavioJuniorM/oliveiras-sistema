import { useCallback, useEffect, useMemo, useState } from "react";
import { CampoTaxaEntrega, ResumoComTaxa, lerTaxa, taxaInicial, valorProdutos } from "./TaxaEntrega";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { dataLocalISO, formatarDataHora, formatarMoeda, formatarQuantidadePedido } from "../../lib/formatadores";
import { imprimirPedidoTermico } from "../../lib/impressao";
import { Pedido, PedidoItem, Produto, StatusOperacaoPedido, UnidadePedido } from "../../types";
import { CampoObservacao } from "./NovoPedido";
import { ModalAlterarComanda, descricaoPagamentoAtual } from "./AlterarComanda";
import { useAuth } from "../../contexts/AuthContext";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

// Fluxo da comanda: anota → pesa (em preparo) → fecha (prontos) → retirada ou rota → entregues
const FLUXO: StatusOperacaoPedido[] = ["RECEBIDO", "EM_PREPARO", "PRONTO", "AGUARDANDO_RETIRADA", "EM_ENTREGA", "ENTREGUE"];
const STATUS_CONFIG: Record<string, { titulo: string; descricao: string; fundo: string }> = {
  RECEBIDO: { titulo: "Recebidos", descricao: "Aguardando preparo", fundo: "bg-slate-100" },
  EM_PREPARO: { titulo: "Em preparo", descricao: "Cortes sendo feitos", fundo: "bg-gold/10" },
  PRONTO: { titulo: "Prontos", descricao: "Escolher retirada ou entrega", fundo: "bg-success/10" },
  AGUARDANDO_RETIRADA: { titulo: "Retiradas", descricao: "Cliente vem buscar", fundo: "bg-gold/15" },
  EM_ENTREGA: { titulo: "Em rota", descricao: "Saiu para o cliente", fundo: "bg-blue-100" },
  ENTREGUE: { titulo: "Entregues", descricao: "Finalizados hoje", fundo: "bg-black/5" },
};

/** "2026-11-10" → "ter 10/11" */
function diaCurto(dia: string) {
  const data = new Date(`${dia.slice(0, 10)}T12:00:00Z`);
  return `${data.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "")} ${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
}

function horaCurta(instante: string) {
  return new Date(instante).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function nomeDoCliente(pedido: Pedido) {
  return pedido.cliente?.nomeFantasia || pedido.cliente?.razaoSocial || pedido.cliente?.nome || pedido.nomeCliente || "Consumidor final";
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

/** Margem de aviso visual: 1 kg (ou 1000 g quando o item foi pedido em gramas). */
function margemAviso(unidade?: string) {
  return unidade === "g" ? 1000 : 1;
}

/** Converte a quantidade digitada para quilos quando o item foi pedido em gramas. */
function emQuilos(quantidade: number, unidade?: string) {
  return unidade === "g" ? quantidade / 1000 : quantidade;
}

/** Como o pedido foi anotado: "5 kg", "500 g", "15 unidades". */
function textoPedido(item: PedidoItem) {
  return formatarQuantidadePedido(item.pesoOuQtd, item.unidadePedido);
}

/** Carnes por peso: o valor real é sempre o peso da balança em kg. */
function unidadeReal(item: PedidoItem) {
  return item.produto?.tipoVenda === "PESO" ? "kg" : "un";
}

function textoReal(item: PedidoItem) {
  if (item.statusPreparo !== "CORTADO" || item.pesoReal == null) return "a pesar";
  return `${Number(item.pesoReal).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unidadeReal(item)}`;
}

function precoPorUnidade(item: PedidoItem) {
  return `${formatarMoeda(item.precoUnitario)}/${item.produto?.unidadePreco || item.produto?.unidadeMedida || "un"}`;
}

/** Pedido convertido para kg quando comparável com a balança (kg ou g). */
function pedidoEmKg(item: PedidoItem) {
  const qtd = Number(item.pesoOuQtd);
  if (item.unidadePedido === "kg") return qtd;
  if (item.unidadePedido === "g") return qtd / 1000;
  return null;
}

function limitePesoComTolerancia(solicitado: number, toleranciaPercentual: number) {
  return solicitado * (1 + toleranciaPercentual / 100);
}

function prepararPedidoParaExibicao(pedido: Pedido): Pedido {
  return {
    ...pedido,
    statusOperacao: pedido.statusOperacao === "EXPEDICAO" ? "PRONTO" : pedido.statusOperacao,
    // Ordem fixa por nome: o item não "pula" de lugar quando é pesado
    itens: [...pedido.itens].sort((a, b) => (a.produto?.nome || "").localeCompare(b.produto?.nome || "", "pt-BR")).map((item) => ({
      ...item,
      produto: item.produto ? { ...item.produto, unidadePreco: item.produto.unidadeMedida, unidadeMedida: rotuloUnidade(item.unidadePedido, item.produto.unidadeMedida) } : item.produto,
    })),
  };
}

const NOME_LOJA = "CASA DE CARNES OLIVEIRAS";
const ENDERECO_LOJA = "Rua Ametista, 22 - Jd Mutinga";
const FORMAS_RECEBIMENTO: { valor: string; rotulo: string }[] = [
  { valor: "CARTAO_DEBITO", rotulo: "💳 Débito" },
  { valor: "CARTAO_CREDITO", rotulo: "💳 Crédito" },
  { valor: "PIX", rotulo: "Pix" },
  { valor: "DINHEIRO", rotulo: "Dinheiro" },
];

/** Quanto falta receber. null = venda a prazo (cobrança pelo financeiro, não na entrega). */
function saldoACobrar(pedido: Pedido): number | null {
  if (pedido.contaReceber) return null;
  const pago = (pedido.pagamentos || []).reduce((soma, pagamento) => soma + Number(pagamento.valor), 0);
  return Math.max(Number((Number(pedido.total) - pago).toFixed(2)), 0);
}

function telefoneDoCliente(pedido: Pedido) {
  return pedido.cliente?.telefone || pedido.cliente?.whatsapp || pedido.telefoneCliente || "";
}

function enderecoDoPedido(pedido: Pedido) {
  return pedido.enderecoEntrega || pedido.cliente?.endereco || "";
}

function textoCobranca(pedido: Pedido) {
  const saldo = saldoACobrar(pedido);
  if (saldo == null) return "📄 *VENDA A PRAZO — NÃO COBRAR*";
  if (saldo <= 0.01) return "✅ *JÁ PAGO — NÃO COBRAR*";
  return `💳 *COBRAR NA MAQUININHA: ${formatarMoeda(saldo)}*`;
}

/** Mensagem completa para o motoboy (WhatsApp). */
function mensagemMotoboy(pedido: Pedido) {
  const endereco = enderecoDoPedido(pedido);
  const telefone = telefoneDoCliente(pedido);
  const pesoTotal = pedido.itens.reduce((soma, item) => soma + (item.produto?.tipoVenda === "PESO" && item.pesoReal != null ? Number(item.pesoReal) : 0), 0);
  const linhas = [
    `🛵 *ENTREGA — ${NOME_LOJA}*`,
    "",
    `*Pedido:* ${pedido.numero}`,
    `*Cliente:* ${nomeDoCliente(pedido)}`,
    telefone ? `*Telefone:* ${telefone}` : "",
    `*Endereço:* ${endereco || "não informado"}`,
    endereco ? `📍 Mapa: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : "",
    "",
    `*Volumes:* ${pedido.itens.length} ${pedido.itens.length === 1 ? "item" : "itens"}${pesoTotal > 0 ? ` (${pesoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg)` : ""}`,
    ...(Number(pedido.taxaEntrega ?? 0) > 0
      ? [`*Produtos:* ${formatarMoeda(valorProdutos(pedido))}`, `*Taxa de entrega:* ${formatarMoeda(Number(pedido.taxaEntrega))}`, `*Total:* ${formatarMoeda(pedido.total)}`]
      : [`*Valor do pedido:* ${formatarMoeda(pedido.total)}`]),
    textoCobranca(pedido),
    pedido.observacoesCliente ? `*Obs.:* ${pedido.observacoesCliente}` : "",
    "",
    `Retirar na loja: ${ENDERECO_LOJA}`,
  ];
  return linhas.filter((linha, indice, todas) => linha !== "" || (todas[indice - 1] !== "" && indice > 0)).join("\n");
}

/** Link do WhatsApp com a mensagem pronta; com telefone, abre direto na conversa. */
function linkWhatsAppMotoboy(pedido: Pedido, telefone?: string) {
  const digitos = (telefone || "").replace(/\D/g, "");
  const numero = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagemMotoboy(pedido))}`;
}

interface MotoboyCadastrado { id: string; nome: string; telefone: string }


/** Mensagem pronta para o motoboy: abrir no WhatsApp ou copiar. */
function ModalMotoboy({ pedido, onFechar }: { pedido: Pedido; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");
  const [motoboys, setMotoboys] = useState<MotoboyCadastrado[]>([]);
  useEffect(() => {
    api<MotoboyCadastrado[]>("/motoboys").then(setMotoboys).catch(() => setMotoboys([]));
  }, []);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagemMotoboy(pedido));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" onClick={onFechar}><div className="w-full max-w-lg rounded-card bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
    <p className="font-display text-2xl uppercase text-ink">Rota para o motoboy</p><p className="mt-1 text-sm text-muted">Toque no nome do motoboy para abrir a conversa dele no WhatsApp com a mensagem pronta.</p>
    <pre className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-4 font-sans text-sm text-ink">{mensagemMotoboy(pedido).replace(/\*/g, "")}</pre>
    {!enderecoDoPedido(pedido) && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">Esta comanda está sem endereço.</p>}
    {erro && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variante="secundaria" onClick={onFechar}>Fechar</Button><Button variante="secundaria" onClick={copiar}>{copiado ? "Copiado ✓" : "Copiar mensagem"}</Button><a href={linkWhatsAppMotoboy(pedido)} target="_blank" rel="noreferrer"><Button variante="secundaria" className="w-full">{motoboys.length ? "Outro contato" : "Abrir no WhatsApp"}</Button></a></div>
    {motoboys.length > 0 && <div className="mt-4 border-t border-border pt-4"><p className="mb-2 text-sm font-semibold text-ink">Enviar direto para:</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{motoboys.map((motoboy) => <a key={motoboy.id} href={linkWhatsAppMotoboy(pedido, motoboy.telefone)} target="_blank" rel="noreferrer"><Button className="w-full !bg-[#1f9d55] hover:!bg-[#187a42]">🛵 {motoboy.nome}</Button></a>)}</div></div>}
  </div></div>;
}

/** Botões de saída da comanda (Prontos → Retirada/Entrega → Entregues). */
function AcoesSaida({ pedido, onAtualizado, onGerarRota }: { pedido: Pedido; onAtualizado: (pedido: Pedido) => void; onGerarRota: (pedido: Pedido) => void }) {
  const status = pedido.statusOperacao || "RECEBIDO";
  const [modal, setModal] = useState<"" | "entrega" | "concluir" | "prazo">("");
  const [endereco, setEndereco] = useState(enderecoDoPedido(pedido));
  const [formaRecebida, setFormaRecebida] = useState("CARTAO_DEBITO");
  const [taxaTexto, setTaxaTexto] = useState(taxaInicial(pedido));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const saldo = saldoACobrar(pedido);
  const precisaReceber = saldo != null && saldo > 0.01;
  const taxa = lerTaxa(taxaTexto);
  const taxaValida = taxa !== null && !Number.isNaN(taxa);
  // O que o motoboy vai cobrar depois de somar a nova taxa
  const saldoComTaxa = saldo == null ? null : Math.max(saldo + ((taxaValida ? taxa : 0) - Number(pedido.taxaEntrega ?? 0)), 0);

  async function mover(statusOperacao: StatusOperacaoPedido, extras: Record<string, string | number> = {}) {
    setSalvando(true);
    setErro("");
    try {
      const atualizado = await api<Pedido>(`/pedidos/${pedido.id}/status-operacao`, { method: "PATCH", body: { statusOperacao, ...extras } });
      setModal("");
      onAtualizado(atualizado);
      if (statusOperacao === "EM_ENTREGA") onGerarRota(prepararPedidoParaExibicao(atualizado));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível atualizar a comanda.");
    } finally {
      setSalvando(false);
    }
  }



  const parar = (e: React.MouseEvent) => e.stopPropagation();

  return <div onClick={parar} className="flex flex-col gap-2">
    {status === "PRONTO" && <div className="grid grid-cols-2 gap-2"><Button variante="secundaria" disabled={salvando} onClick={() => mover("AGUARDANDO_RETIRADA")}>🏪 Retirada</Button><Button disabled={salvando} onClick={() => { setErro(""); setTaxaTexto(taxaInicial(pedido)); setModal("entrega"); }}>🛵 Entrega</Button></div>}
    {status === "AGUARDANDO_RETIRADA" && <div className="grid grid-cols-2 gap-2"><Button variante="secundaria" disabled={salvando} onClick={() => mover("PRONTO")}>Voltar</Button><Button disabled={salvando} onClick={() => precisaReceber ? setModal("concluir") : mover("ENTREGUE")}>Cliente retirou</Button></div>}
    {status === "EM_ENTREGA" && <div className="grid grid-cols-2 gap-2"><Button variante="secundaria" onClick={() => onGerarRota(pedido)}>📲 Gerar rota (motoboy)</Button><Button disabled={salvando} onClick={() => precisaReceber ? setModal("concluir") : mover("ENTREGUE")}>Entregue</Button></div>}
    {erro && !modal && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{erro}</p>}

    {modal === "prazo" && <ModalAlterarComanda pedido={pedido} pagamentoInicial="A_PRAZO" concluirAoSalvar onFechar={() => setModal("")} onAtualizado={onAtualizado} />}
    {modal && modal !== "prazo" && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" onClick={() => setModal("")}><div className="w-full max-w-lg rounded-card bg-surface p-6 shadow-2xl" onClick={parar}>
      {modal === "entrega" && <><p className="font-display text-2xl uppercase text-ink">Enviar para entrega</p><p className="mt-1 text-sm text-muted">Comanda {pedido.numero} · {nomeDoCliente(pedido)}</p><div className="mt-4"><Input label="Endereço de entrega" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro, complemento" autoFocus /></div><div className="mt-4"><CampoTaxaEntrega valor={taxaTexto} onChange={setTaxaTexto} id={`taxa-${pedido.id}`} /></div><div className="mt-3"><ResumoComTaxa produtos={valorProdutos(pedido)} taxa={taxaValida ? taxa : 0} /></div><p className="mt-3 rounded-lg bg-background px-3 py-2 text-sm text-ink">{saldoComTaxa == null ? "📄 Venda a prazo — não cobrar" : saldoComTaxa <= 0.01 ? "✅ Já pago — não cobrar" : `💳 Motoboy cobra na maquininha: ${formatarMoeda(saldoComTaxa)}`}</p>{erro && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}<div className="mt-5 flex justify-end gap-2"><Button variante="secundaria" onClick={() => setModal("")}>Cancelar</Button><Button disabled={salvando || !endereco.trim() || !taxaValida} onClick={() => mover("EM_ENTREGA", { enderecoEntrega: endereco.trim(), taxaEntrega: taxa ?? 0 })}>{salvando ? "Enviando..." : taxaValida ? "Mandar para a rota" : "Informe a taxa de entrega"}</Button></div></>}
      {modal === "concluir" && <><p className="font-display text-2xl uppercase text-ink">{status === "EM_ENTREGA" ? "Confirmar entrega" : "Confirmar retirada"}</p><p className="mt-1 text-sm text-muted">Comanda {pedido.numero} · {nomeDoCliente(pedido)}</p><div className="mt-4 rounded-lg bg-background px-4 py-3"><p className="text-sm text-muted">Valor recebido</p><p className="font-display text-3xl text-gold-texto">{formatarMoeda(saldo || 0)}</p></div><p className="mt-4 text-sm font-semibold text-ink">Como o cliente pagou?</p><div className="mt-2 grid grid-cols-2 gap-2">{FORMAS_RECEBIMENTO.map((forma) => <button key={forma.valor} type="button" onClick={() => setFormaRecebida(forma.valor)} className={`rounded-lg border px-3 py-3 text-sm font-semibold ${formaRecebida === forma.valor ? "border-primary bg-primary/5 text-primary" : "border-border text-ink"}`}>{forma.rotulo}</button>)}<button type="button" onClick={() => setModal("prazo")} className="col-span-2 rounded-lg border border-dashed border-primary/50 px-3 py-3 text-sm font-semibold text-primary hover:bg-primary/5">📄 Não pagou agora — vai pagar depois (a prazo)</button></div>{erro && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}<div className="mt-5 flex justify-end gap-2"><Button variante="secundaria" onClick={() => setModal("")}>Cancelar</Button><Button disabled={salvando} onClick={() => mover("ENTREGUE", { formaRecebida })}>{salvando ? "Salvando..." : "Concluir e mover para entregues"}</Button></div></>}

    </div></div>}
  </div>;
}

function proximoStatus(status: string): StatusOperacaoPedido | null {
  const indice = FLUXO.indexOf(status as StatusOperacaoPedido);
  return indice >= 0 && indice < FLUXO.length - 1 ? FLUXO[indice + 1] : null;
}

export function PedidosDoDia() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  // Padrão: o que ainda precisa de trabalho (sem as entregues)
  const [filtro, setFiltro] = useState("ANDAMENTO");
  const [carregando, setCarregando] = useState(true);
  const [comandaAberta, setComandaAberta] = useState<Pedido | null>(null);
  const [rotaAberta, setRotaAberta] = useState<Pedido | null>(null);
  const [erro, setErro] = useState("");
  const [toleranciaPesagemPercentual, setToleranciaPesagemPercentual] = useState(10);
  // Hoje: comandas do dia + em aberto de dias anteriores. Outro dia: histórico.
  const [dia, setDia] = useState(dataLocalISO());
  const ehHoje = dia === dataLocalISO();
  const ehFuturo = dia > dataLocalISO();
  const [agendados, setAgendados] = useState<{ data: string; quantidade: number }[]>([]);
  useEffect(() => {
    setFiltro(dia === dataLocalISO() ? "ANDAMENTO" : "TODOS");
  }, [dia]);

  const carregarPedidos = useCallback(async () => {
    try {
      const [resposta, configuracao, proximos] = await Promise.all([
        api<Pedido[]>(`/pedidos/painel?data=${dia}`),
        api<{ toleranciaPesagemPercentual: number }>("/configuracoes/pesagem"),
        api<{ data: string; quantidade: number }[]>("/pedidos/agendados").catch(() => []),
      ]);
      setAgendados(proximos);
      setPedidos(resposta.filter((pedido) => pedido.statusPagamento !== "CANCELADO").map(prepararPedidoParaExibicao));
      setToleranciaPesagemPercentual(configuracao.toleranciaPesagemPercentual);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar os pedidos.");
    } finally {
      setCarregando(false);
    }
  }, [dia]);

  useEffect(() => {
    setCarregando(true);
    carregarPedidos();
    // Atualização automática só faz sentido no painel de hoje
    if (!ehHoje) return;
    const intervalo = window.setInterval(carregarPedidos, 10000);
    return () => window.clearInterval(intervalo);
  }, [carregarPedidos, ehHoje]);

  const pedidosVisiveis = useMemo(() => {
    const lista = filtro === "TODOS" ? pedidos : filtro === "ANDAMENTO" ? pedidos.filter((pedido) => pedido.statusOperacao !== "ENTREGUE") : pedidos.filter((pedido) => (pedido.statusOperacao || "RECEBIDO") === filtro);
    // Em andamento: a mais antiga primeiro (fila do balcão). Entregues/todos: a mais recente primeiro.
    const maisAntigaPrimeiro = filtro !== "TODOS" && filtro !== "ENTREGUE";
    return [...lista].sort((a, b) => (new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()) * (maisAntigaPrimeiro ? 1 : -1));
  }, [filtro, pedidos]);

  function atualizarPedidoNaLista(atualizado: Pedido) {
    const pedidoPreparado = prepararPedidoParaExibicao(atualizado);
    setPedidos((atuais) => atuais.map((pedido) => pedido.id === pedidoPreparado.id ? pedidoPreparado : pedido));
    // Só atualiza a comanda aberta se ela já estiver aberta (ações do card não abrem o modal)
    setComandaAberta((aberta) => aberta && aberta.id === pedidoPreparado.id ? pedidoPreparado : aberta);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="hidden text-sm text-muted sm:block">Totem de produção · atualização automática a cada 10 segundos</p><p className="mt-2 hidden text-sm text-muted sm:block">Abra uma comanda para pesar os cortes. O valor só aparece depois da pesagem.</p></div>
        <div className="flex items-end gap-2"><div className="flex flex-col gap-1"><label htmlFor="dia-painel" className="text-xs font-semibold uppercase tracking-wide text-muted">Dia</label><input id="dia-painel" type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink" /></div>{!ehHoje && <Button variante="secundaria" className="h-11" onClick={() => setDia(dataLocalISO())}>Voltar para hoje</Button>}<Link to="/pedidos/novo" className="hidden sm:block"><Button tamanho="grande" className="w-full xl:w-auto">Novo pedido</Button></Link></div>
      </div>
      <div className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-background px-4 py-2 sm:static sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:bg-transparent sm:px-0 sm:py-0 xl:grid-cols-8" role="tablist" aria-label="Filtrar comandas por etapa"><Filtro titulo="Em andamento" quantidade={pedidos.filter((pedido) => pedido.statusOperacao !== "ENTREGUE").length} ativo={filtro === "ANDAMENTO"} onClick={() => setFiltro("ANDAMENTO")} />{FLUXO.map((status) => <Filtro key={status} titulo={STATUS_CONFIG[status].titulo} quantidade={pedidos.filter((pedido) => (pedido.statusOperacao || "RECEBIDO") === status).length} ativo={filtro === status} onClick={() => setFiltro(status)} />)}<Filtro titulo="Todos" quantidade={pedidos.length} ativo={filtro === "TODOS"} onClick={() => setFiltro("TODOS")} /></div>
      {ehFuturo && <div className="rounded-lg border border-primary/30 bg-primary/[0.06] px-4 py-3 text-sm font-semibold text-ink">📅 Encomendas para {diaCurto(dia)}: pedidos já anotados para este dia.</div>}
      {!ehHoje && !ehFuturo && <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-ink">Histórico de {dia.split("-").reverse().join("/")}: comandas anotadas neste dia.</div>}
      {ehHoje && agendados.length > 0 && <div className="flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/[0.05] px-4 py-3 sm:flex-row sm:items-center"><p className="shrink-0 text-sm font-semibold text-ink">📅 Encomendas para os próximos dias:</p><div className="flex flex-wrap gap-2">{agendados.slice(0, 8).map((a) => <button key={a.data} type="button" onClick={() => setDia(a.data)} className="min-h-9 rounded-full border border-primary/30 bg-white px-3 text-sm font-semibold text-primary hover:bg-primary hover:text-white">{diaCurto(a.data)} · {a.quantidade} {a.quantidade === 1 ? "pedido" : "pedidos"}</button>)}</div></div>}
      {erro && <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</div>}
      {carregando && <Card><p className="text-sm text-muted">Carregando comandas...</p></Card>}
      {!carregando && pedidosVisiveis.length === 0 && <Card className="py-12 text-center"><p className="font-display text-2xl uppercase tracking-wide text-ink">{filtro === "ANDAMENTO" ? "Tudo em dia" : "Nenhuma comanda aqui"}</p><p className="mt-2 text-sm text-muted">Os novos pedidos aparecerão automaticamente neste painel.</p></Card>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pedidosVisiveis.map((pedido) => {
          const status = pedido.statusOperacao || "RECEBIDO";
          const config = STATUS_CONFIG[status] || STATUS_CONFIG.RECEBIDO;
          const cortesFeitos = pedido.itens.filter((item) => item.statusPreparo === "CORTADO").length;
          const aguardando = cortesFeitos < pedido.itens.length;
          const encomenda = pedido.dataAgendada ? pedido.dataAgendada.slice(0, 10) : null;
          const emAbertoDesde = ehHoje && !encomenda && dataLocalISO(new Date(pedido.criadoEm)) !== dia && status !== "ENTREGUE";
          return <div key={pedido.id} onClick={() => setComandaAberta(pedido)} className="flex cursor-pointer flex-col overflow-hidden rounded-card border border-border bg-surface text-left shadow-card transition hover:border-primary">
            <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${config.fundo}`}><div className="flex min-w-0 items-baseline gap-2"><p className="font-display text-xl tracking-wide text-ink">{pedido.numero.slice(-6)}</p><p className="text-xs text-muted">{ehHoje && !emAbertoDesde ? horaCurta(pedido.criadoEm) : formatarDataHora(pedido.criadoEm)}</p></div><StatusBadge status={status} /></div>
            <div className="flex-1 px-4 py-3">
              {encomenda && <p className="mb-2 mr-1 inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">📅 Encomenda para {diaCurto(encomenda)}</p>}
              {emAbertoDesde && <p className="mb-2 inline-block rounded bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">Em aberto desde {new Date(pedido.criadoEm).toLocaleDateString("pt-BR")}</p>}
              <div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-base font-semibold text-ink">{nomeDoCliente(pedido)}</p>{aguardando ? <p className="whitespace-nowrap text-xs font-semibold text-gold-texto">{cortesFeitos}/{pedido.itens.length} pesados</p> : <p className="whitespace-nowrap font-bold text-ink">{formatarMoeda(pedido.total)}</p>}</div>
              <ul className="mt-2 space-y-1 text-sm">{pedido.itens.map((item) => <li key={item.id} className="flex items-baseline justify-between gap-2"><span className="min-w-0 text-ink"><span className={item.statusPreparo === "CORTADO" ? "text-success" : "text-muted"} aria-hidden="true">{item.statusPreparo === "CORTADO" ? "✓ " : "○ "}</span><span className="font-semibold">{item.produto?.nome}</span> <span className="text-muted">· {textoPedido(item)}{item.statusPreparo === "CORTADO" ? ` → ${textoReal(item)}` : ""}</span>{item.observacao && <span className="ml-1 rounded bg-gold/15 px-1.5 py-0.5 text-xs font-semibold text-gold-texto">{item.observacao}</span>}</span>{item.statusPreparo === "CORTADO" && <span className="whitespace-nowrap text-xs text-muted">{formatarMoeda(item.subtotal)}</span>}</li>)}</ul>
            </div>
            <div className="flex justify-end border-t border-border px-4 py-1.5"><button type="button" onClick={(e) => { e.stopPropagation(); setComandaAberta(pedido); }} className="py-1 text-sm font-semibold text-primary">Abrir comanda →</button></div>
            {["PRONTO", "AGUARDANDO_RETIRADA", "EM_ENTREGA"].includes(status) && <div className="border-t border-border px-5 py-3">{status === "EM_ENTREGA" && <p className="mb-2 truncate text-xs text-muted">📍 {enderecoDoPedido(pedido) || "sem endereço"}</p>}<AcoesSaida pedido={pedido} onAtualizado={atualizarPedidoNaLista} onGerarRota={setRotaAberta} /></div>}
          </div>;
        })}
      </div>
      {comandaAberta && <ModalComanda pedido={comandaAberta} toleranciaPesagemPercentual={toleranciaPesagemPercentual} onFechar={() => setComandaAberta(null)} onAtualizado={atualizarPedidoNaLista} onGerarRota={setRotaAberta} onCancelada={(id) => { setPedidos((atuais) => atuais.filter((atual) => atual.id !== id)); setComandaAberta(null); }} />}
      {rotaAberta && <ModalMotoboy pedido={rotaAberta} onFechar={() => setRotaAberta(null)} />}
    </div>
  );
}

function Filtro({ titulo, quantidade, ativo, onClick }: { titulo: string; quantidade: number; ativo: boolean; onClick: () => void }) {
  // No celular vira uma "pílula" compacta (faixa rolável); a partir de sm, card com número grande
  return <button type="button" role="tab" aria-selected={ativo} onClick={onClick} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-left transition sm:block sm:rounded-card sm:p-3 ${ativo ? "border-primary bg-primary text-white" : "border-border bg-surface hover:border-primary"}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-80">{titulo}</p><p className={`font-display text-lg sm:mt-1 sm:text-3xl ${ativo ? "text-white" : "text-ink"}`}>{quantidade}</p></button>;
}

function ModalComanda({ pedido, toleranciaPesagemPercentual, onFechar, onAtualizado, onGerarRota, onCancelada }: { pedido: Pedido; toleranciaPesagemPercentual: number; onFechar: () => void; onAtualizado: (pedido: Pedido) => void; onGerarRota: (pedido: Pedido) => void; onCancelada: (pedidoId: string) => void }) {
  const { usuario } = useAuth();
  const [peso, setPeso] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState("");
  const [erro, setErro] = useState("");
  const [finalizacaoAberta, setFinalizacaoAberta] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [alterada, setAlterada] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [alterandoComanda, setAlterandoComanda] = useState(false);
  const ehAdmin = usuario?.papel === "ADMINISTRATIVO";
  const status = pedido.statusOperacao || "RECEBIDO";
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.RECEBIDO;
  const proximo = proximoStatus(status);
  const todosCortados = pedido.itens.length > 0 && pedido.itens.every((item) => item.statusPreparo === "CORTADO");
  const podeFinalizar = todosCortados && (status === "RECEBIDO" || status === "EM_PREPARO");
  const podeImprimir = ["EXPEDICAO", "PRONTO", "AGUARDANDO_RETIRADA", "EM_ENTREGA", "ENTREGUE"].includes(status);

  async function imprimir(tipo: "corte" | "cliente") {
    setImprimindo(true);
    setErro("");
    try {
      await imprimirPedidoTermico(pedido.id, tipo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a impressão.");
    } finally {
      setImprimindo(false);
    }
  }

  async function atualizarItem(itemId: string, statusPreparo: "PENDENTE" | "CORTADO") {
    const textoPeso = peso[itemId];
    const pesoReal = statusPreparo === "CORTADO" && textoPeso ? Number(textoPeso.replace(",", ".")) : undefined;
    if (statusPreparo === "CORTADO" && (!pesoReal || pesoReal <= 0)) return setErro("Informe o peso da balança antes de confirmar.");
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

  const totalPesado = pedido.itens.filter((item) => item.statusPreparo === "CORTADO").reduce((soma, item) => soma + Number(item.subtotal), 0);
  const pesados = pedido.itens.filter((item) => item.statusPreparo === "CORTADO").length;
  const aberta = status === "RECEBIDO" || status === "EM_PREPARO";

  return <div className="fixed inset-0 z-40 overflow-y-auto bg-black/50 px-3 py-5 sm:px-6"><div className="mx-auto max-w-4xl overflow-hidden rounded-card bg-surface shadow-2xl">
    <div className={`flex items-start justify-between px-6 py-5 ${config.fundo}`}><div><p className="font-display text-2xl text-ink sm:text-3xl">Comanda {pedido.numero}</p><p className="mt-1 text-sm text-muted">{nomeDoCliente(pedido)} · {formatarDataHora(pedido.criadoEm)}</p>{pedido.dataAgendada && <p className="mt-2 inline-block rounded bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary">📅 Encomenda para {diaCurto(pedido.dataAgendada)}</p>}</div><button type="button" onClick={onFechar} className="text-2xl text-muted hover:text-ink" aria-label="Fechar">×</button></div>
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-4"><div className="flex flex-wrap items-center gap-3"><StatusBadge status={status} /><p className="text-sm text-ink">{aberta ? "Corte cada item e informe o peso da balança. O valor aparece conforme os itens são pesados." : "Comanda fechada."}</p></div><p className="text-sm font-semibold text-ink">{pesados}/{pedido.itens.length} pesados</p></div>
      {aberta && <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted">{editando ? "Inclua, altere ou remova carnes. Itens já pesados: use “Corrigir peso” antes." : "Cliente ligou e quer mudar algo?"}</p><Button variante={editando ? "primaria" : "secundaria"} onClick={() => setEditando((atual) => !atual)}>{editando ? "Concluir edição" : "✏️ Editar itens"}</Button></div>}
      {alterada && !editando && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3"><p className="text-sm font-semibold text-ink">Comanda alterada. Reimprima o pedido para o balcão.</p><Button variante="secundaria" disabled={imprimindo} onClick={() => { imprimir("corte"); setAlterada(false); }}>Imprimir pedido para os cortes</Button></div>}
      {editando ? <EditorComanda pedido={pedido} onAtualizado={(atualizado) => { setAlterada(true); onAtualizado(atualizado); }} /> : <div className="space-y-3">{pedido.itens.map((item) => {
        const pesado = item.statusPreparo === "CORTADO";
        const porPeso = item.produto?.tipoVenda === "PESO";
        const valorDigitado = Number(peso[item.id]?.replace(",", ".") || 0);
        const pedidoKg = pedidoEmKg(item);
        const acima = porPeso && pedidoKg != null && valorDigitado > limitePesoComTolerancia(pedidoKg, toleranciaPesagemPercentual);
        const muitoAbaixo = porPeso && pedidoKg != null && valorDigitado > 0 && valorDigitado < pedidoKg * 0.1;
        return <div key={item.id} className={`rounded-lg border p-4 ${pesado ? "border-success/30 bg-success/5" : "border-border"}`}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-lg font-semibold text-ink">{item.produto?.nome || "Carne / produto"}</p><p className="text-sm text-muted">Cliente pediu: <strong className="text-ink">{textoPedido(item)}</strong></p>{item.observacao && <p className="mt-1 inline-block rounded bg-gold/15 px-2 py-0.5 text-sm font-semibold text-ink">» {item.observacao}</p>}</div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pesado ? "bg-success/10 text-success" : "bg-gold/10 text-gold-texto"}`}>{pesado ? "Pesado" : "A pesar"}</span></div>
          {pesado && porPeso && pedidoKg != null && Number(item.pesoReal) > limitePesoComTolerancia(pedidoKg, toleranciaPesagemPercentual) && <p className="mt-3 rounded-lg bg-gold/15 px-3 py-2 text-xs font-semibold text-ink">⚠ Peso {(Number(item.pesoReal) - pedidoKg).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg acima do pedido (tolerância de {toleranciaPesagemPercentual}%).</p>}{pesado ? <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-white/70 p-3 text-sm"><p className="text-muted">Balança<strong className="block text-success">{textoReal(item)}</strong></p><p className="text-muted">Preço<strong className="block text-ink">{precoPorUnidade(item)}</strong></p><p className="text-muted">Valor<strong className="block text-ink">{formatarMoeda(item.subtotal)}</strong></p></div>
          : aberta && <div className="mt-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><Input label={porPeso ? "Peso na balança (kg)" : "Quantidade separada (un)"} type="number" inputMode="decimal" step={porPeso ? "0.001" : "1"} placeholder={porPeso ? (pedidoKg != null ? String(pedidoKg).replace(".", ",") : "Ex.: 3,250") : String(item.pesoOuQtd)} value={peso[item.id] || ""} onChange={(e) => setPeso((atual) => ({ ...atual, [item.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && atualizarItem(item.id, "CORTADO")} /><Button disabled={carregando === item.id} onClick={() => atualizarItem(item.id, "CORTADO")}>{carregando === item.id ? "Salvando..." : acima ? "Confirmar mesmo assim" : "Confirmar peso"}</Button></div>
            {valorDigitado > 0 && !muitoAbaixo && <p className="mt-2 text-xs text-muted">Valor deste item: <strong className="text-ink">{formatarMoeda(Number(item.precoUnitario) * valorDigitado)}</strong> ({precoPorUnidade(item)})</p>}
            {muitoAbaixo && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">Peso muito abaixo do pedido ({pedidoKg!.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg). Digite o peso da balança em quilos — ex.: 5,2 para 5.200 g.</p>}
            {acima && <p className="mt-2 rounded-lg bg-gold/15 px-3 py-2 text-xs font-semibold text-ink">⚠ Atenção: passou {(valorDigitado - pedidoKg!).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg do pedido ({pedidoKg!.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg), acima da tolerância de {toleranciaPesagemPercentual}%. Confira com o cliente se ele aceita — se sim, pode confirmar o peso.</p>}
          </div>}
          {aberta && <AlterarPrecoItem pedido={pedido} item={item} onAtualizado={onAtualizado} />}
          {pesado && aberta && <Button variante="fantasma" className="mt-1 px-0" disabled={carregando === item.id} onClick={() => atualizarItem(item.id, "PENDENTE")}>Corrigir peso</Button>}
        </div>; })}</div>}
      {pesados > 0 && <div className="mt-4 flex items-center justify-between rounded-lg bg-background px-4 py-3"><span className="text-sm font-semibold text-ink">{todosCortados ? "Valor da comanda" : `Parcial (${pesados} de ${pedido.itens.length} itens pesados)`}</span><span className={`font-display text-3xl ${todosCortados ? "text-gold-texto" : "text-muted"}`}>{formatarMoeda(totalPesado)}</span></div>}
      {erro && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {podeImprimir && <div className="mt-6 rounded-lg border-2 border-success/30 bg-success/5 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-display text-2xl uppercase text-ink">Comanda fechada</p><button type="button" onClick={() => setAlterandoComanda(true)} className="min-h-9 rounded-lg border border-primary/40 bg-white px-3 text-sm font-semibold text-primary hover:bg-primary/5">✎ Alterar pagamento / entrega</button></div><p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-ink">💰 <strong>{descricaoPagamentoAtual(pedido)}</strong> · {pedido.tipoEntrega === "DELIVERY" ? "🛵 Entrega" : "🏪 Retirada"}</p><p className="mt-2 text-sm text-muted">Imprima a nota com a logo, os pesos e o valor total para enviar ao cliente.</p><Button className="mt-4 w-full" tamanho="grande" disabled={imprimindo} onClick={() => imprimir("cliente")}>{imprimindo ? "Preparando impressão..." : "Imprimir nota do cliente"}</Button>{status !== "ENTREGUE" && <div className="mt-4 border-t border-success/20 pt-4"><p className="mb-2 text-sm font-semibold text-ink">{status === "PRONTO" ? "Como o pedido vai sair?" : status === "AGUARDANDO_RETIRADA" ? "Aguardando o cliente retirar" : `Em rota · ${enderecoDoPedido(pedido)}`}</p><AcoesSaida pedido={pedido} onAtualizado={onAtualizado} onGerarRota={onGerarRota} /></div>}</div>}
      {podeFinalizar && <div className="mt-6 rounded-lg border-2 border-primary/20 bg-primary/5 p-4"><p className="font-display text-2xl uppercase text-ink">Tudo pesado</p><p className="mt-1 text-sm text-muted">Confira o valor e defina o pagamento. A comanda vai para Prontos.</p><Button className="mt-4 w-full" tamanho="grande" onClick={() => setFinalizacaoAberta(true)}>Fechar comanda</Button></div>}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><div className="flex flex-col gap-2 sm:flex-row"><Button variante="secundaria" onClick={onFechar}>Fechar</Button>{ehAdmin && <Button variante="fantasma" className="!text-danger hover:!bg-danger/10" onClick={() => setCancelando(true)}>Cancelar comanda</Button>}<Button variante="secundaria" disabled={imprimindo} onClick={() => imprimir("corte")}>Imprimir pedido para os cortes</Button>{podeImprimir && <Button variante="secundaria" onClick={() => setAlterandoComanda(true)}>✎ Alterar</Button>}</div></div>
    </div></div>{cancelando && <ModalCancelamento pedido={pedido} onFechar={() => setCancelando(false)} onCancelada={() => { setCancelando(false); onCancelada(pedido.id); }} />}{alterandoComanda && <ModalAlterarComanda pedido={pedido} onFechar={() => setAlterandoComanda(false)} onAtualizado={onAtualizado} />}{finalizacaoAberta && <ModalFinalizacao pedido={pedido} onAtualizado={onAtualizado} onFechar={() => setFinalizacaoAberta(false)} onFinalizado={(atualizado) => { setFinalizacaoAberta(false); onAtualizado(atualizado); }} />}</div>;
}

function ModalFinalizacaoPublico({ pedido, formaPagamento, onFechar, onFinalizado }: { pedido: Pedido; formaPagamento: string; onFechar: () => void; onFinalizado: (pedido: Pedido) => void }) {
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const delivery = pedido.tipoEntrega === "DELIVERY";

  async function confirmar() {
    setSalvando(true);
    setErro("");
    try {
      const atualizado = await api<Pedido>(`/pedidos/${pedido.id}/finalizar-conferencia`, {
        method: "POST",
        body: { formaPagamento },
      });
      onFinalizado(atualizado);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível finalizar o pedido público.");
    } finally {
      setSalvando(false);
    }
  }

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-3 py-5 sm:px-6"><div className="mx-auto max-w-3xl overflow-hidden rounded-card bg-surface shadow-2xl"><div className="flex items-start justify-between bg-ink px-6 py-5 text-white"><div><p className="font-display text-3xl uppercase">Conferência do pedido online</p><p className="mt-1 text-sm text-white/70">Comanda {pedido.numero} · {nomeDoCliente(pedido)}</p></div><button type="button" onClick={onFechar} className="text-2xl text-white/70">×</button></div><div className="p-6"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-border bg-background p-4"><p className="text-xs uppercase tracking-wide text-muted">Cliente</p><p className="mt-1 font-semibold text-ink">{nomeDoCliente(pedido)}</p><p className="mt-1 text-sm text-muted">{pedido.telefoneCliente || "Telefone não informado"}</p></div><div className="rounded-lg border border-border bg-background p-4"><p className="text-xs uppercase tracking-wide text-muted">Recebimento</p><p className="mt-1 font-semibold text-ink">{delivery ? "Delivery" : "Retirada na loja"}</p><p className="mt-1 text-sm text-muted">Pagamento {delivery ? "na entrega" : "na retirada"}</p></div></div>{delivery && pedido.enderecoEntrega && <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="text-xs uppercase tracking-wide text-muted">Endereço de entrega</p><p className="mt-1 text-sm font-semibold text-ink">{pedido.enderecoEntrega}</p></div>}{pedido.observacoesCliente && <div className="mt-3 rounded-lg border border-border p-4"><p className="text-xs uppercase tracking-wide text-muted">Observações do cliente</p><p className="mt-1 text-sm text-ink">{pedido.observacoesCliente}</p></div>}<div className="mt-5 overflow-hidden rounded-lg border border-border"><div className="divide-y divide-border">{pedido.itens.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3"><div><p className="font-semibold text-ink">{item.produto?.nome || "Produto"}</p><p className="mt-1 text-xs text-muted">Pediu: {textoPedido(item)} · Balança: {textoReal(item)}</p></div><strong className="text-ink">{formatarMoeda(item.subtotal)}</strong></div>)}<div className="flex items-center justify-between bg-background px-4 py-4"><span className="font-semibold text-ink">Valor final</span><span className="font-display text-3xl text-gold-texto">{formatarMoeda(pedido.total)}</span></div></div></div><div className="mt-5 rounded-lg border-2 border-primary/20 bg-primary/5 p-5"><p className="font-display text-2xl uppercase text-ink">Pedido pronto</p><p className="mt-1 text-sm text-muted">O pagamento ficará pendente até o momento combinado com o cliente: {delivery ? "na entrega" : "na retirada"}.</p>{erro && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}</div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variante="secundaria" onClick={onFechar}>Voltar para a comanda</Button><Button tamanho="grande" disabled={salvando} onClick={confirmar}>{salvando ? "Finalizando..." : "Fechar comanda (vai para Prontos)"}</Button></div></div></div></div>;
}


/**
 * Preço especial só desta comanda (desconto para o cliente).
 * Não altera o preço padrão cadastrado em Carnes e Cortes.
 */
function AlterarPrecoItem({ pedido, item, onAtualizado, compacto = false }: { pedido: Pedido; item: PedidoItem; onAtualizado: (pedido: Pedido) => void; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const unidade = item.produto?.unidadePreco || item.produto?.unidadeMedida || "un";
  const precoPadrao = Number(item.produto?.preco ?? item.precoUnitario);
  const precoAtual = Number(item.precoUnitario);
  const especial = Math.abs(precoAtual - precoPadrao) > 0.004;

  function abrir() { setTexto(precoAtual.toFixed(2).replace(".", ",")); setErro(""); setAberto(true); }

  async function salvar(preco: number) {
    if (!(preco > 0)) return setErro("Informe um preço maior que zero.");
    setSalvando(true); setErro("");
    try {
      const atualizado = await api<Pedido>(`/pedidos/${pedido.id}/itens/${item.id}/preco`, { method: "PATCH", body: { precoUnitario: Number(preco.toFixed(2)) } });
      onAtualizado(atualizado);
      setAberto(false);
    } catch (e) { setErro(e instanceof ErroApi ? e.message : "Não foi possível alterar o preço."); }
    finally { setSalvando(false); }
  }

  if (!aberto) {
    return <div className={`flex flex-wrap items-center gap-2 ${compacto ? "mt-1" : "mt-2"}`}>
      {especial && <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-semibold text-gold-texto">Preço especial · padrão {formatarMoeda(precoPadrao)}/{unidade}</span>}
      <button type="button" onClick={abrir} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary underline-offset-2 hover:bg-primary/5 hover:underline">✎ Alterar preço</button>
    </div>;
  }

  const novo = Number(texto.replace(",", "."));
  return <div className="mt-3 rounded-lg border-2 border-primary/25 bg-white p-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Input label={`Preço nesta comanda (R$/${unidade})`} type="number" inputMode="decimal" step="0.01" min="0.01" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(novo); if (e.key === "Escape") setAberto(false); }} />
      <div className="flex gap-2"><Button disabled={salvando} onClick={() => salvar(novo)}>{salvando ? "Salvando..." : "Salvar preço"}</Button><Button variante="secundaria" onClick={() => setAberto(false)}>Cancelar</Button></div>
    </div>
    {novo > 0 && novo < precoPadrao && <p className="mt-2 text-xs font-semibold text-success">Desconto de {formatarMoeda(precoPadrao - novo)}/{unidade} ({Math.round((1 - novo / precoPadrao) * 100)}%){item.statusPreparo === "CORTADO" && item.pesoReal != null && ` · item passa a custar ${formatarMoeda(novo * Number(item.pesoReal))}`}</p>}
    <p className="mt-2 text-xs text-muted">Vale só para esta comanda. Em Carnes e Cortes o preço continua {formatarMoeda(precoPadrao)}/{unidade}.</p>
    {especial && <button type="button" disabled={salvando} onClick={() => salvar(precoPadrao)} className="mt-1 min-h-9 text-xs font-semibold text-ink underline">Voltar ao preço padrão ({formatarMoeda(precoPadrao)})</button>}
    {erro && <p role="alert" className="mt-2 text-sm text-danger">{erro}</p>}
  </div>;
}

function ModalFinalizacao({ pedido, onFechar, onFinalizado, onAtualizado }: { pedido: Pedido; onFechar: () => void; onFinalizado: (pedido: Pedido) => void; onAtualizado: (pedido: Pedido) => void }) {
  const pedidoPublico = pedido.canal === "PUBLICO";
  const [forma, setForma] = useState(pedidoPublico ? (pedido.tipoEntrega === "DELIVERY" ? "NA_ENTREGA" : "NA_RETIRADA") : "NO_RECEBIMENTO");
  const [vencimento, setVencimento] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Pagamento dividido em duas formas (ex.: parte no cartão, parte em dinheiro)
  const [dividir, setDividir] = useState(false);
  const [forma1, setForma1] = useState("CARTAO_DEBITO");
  const [valor1, setValor1] = useState("");
  const [forma2, setForma2] = useState("DINHEIRO");
  // Entrega: taxa cobrada do cliente (sai separada na nota)
  const ehEntrega = pedido.tipoEntrega === "DELIVERY";
  const [taxaTexto, setTaxaTexto] = useState(taxaInicial(pedido));
  const taxaLida = lerTaxa(taxaTexto);
  const taxaFinal = ehEntrega && taxaLida !== null && !Number.isNaN(taxaLida) ? taxaLida : 0;
  const totalComanda = ehEntrega ? Number((valorProdutos(pedido) + taxaFinal).toFixed(2)) : Number(pedido.total);
  const parte1 = Number(valor1.replace(",", ".")) || 0;
  const parte2 = Number(Math.max(totalComanda - parte1, 0).toFixed(2));
  const aVista = forma !== "A_PRAZO" && forma !== "NO_RECEBIMENTO";
  async function confirmar() {
    setErro("");
    if (forma === "A_PRAZO" && !vencimento) return setErro("Informe a data para pagamento posterior.");
    if (ehEntrega && Number.isNaN(taxaLida)) return setErro("A taxa de entrega está inválida.");
    const dividido = aVista && dividir;
    if (dividido) {
      if (forma1 === forma2) return setErro("Escolha duas formas diferentes (ex.: cartão e dinheiro).");
      if (parte1 <= 0 || parte1 >= totalComanda) return setErro(`O valor da 1ª forma precisa ser maior que zero e menor que ${formatarMoeda(totalComanda)}.`);
    }
    setSalvando(true);
    try {
      const corpo = dividido
        ? { formaPagamento: "DIVIDIDO", divisao: [{ forma: forma1, valor: Number(parte1.toFixed(2)) }, { forma: forma2, valor: parte2 }] }
        : { formaPagamento: forma, vencimento: forma === "A_PRAZO" ? vencimento : undefined };
      const atualizado = await api<Pedido>(`/pedidos/${pedido.id}/finalizar-conferencia`, { method: "POST", body: ehEntrega ? { ...corpo, taxaEntrega: taxaFinal } : corpo });
      onFinalizado(atualizado);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível finalizar a comanda.");
    } finally {
      setSalvando(false);
    }
  }
  if (pedidoPublico) {
    return <ModalFinalizacaoPublico pedido={pedido} formaPagamento={forma} onFechar={onFechar} onFinalizado={onFinalizado} />;
  }
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-3 py-5 sm:px-6"><div className="mx-auto max-w-3xl overflow-hidden rounded-card bg-surface shadow-2xl"><div className="flex items-start justify-between bg-ink px-6 py-5 text-white"><div><p className="font-display text-3xl uppercase">Conferência final</p><p className="mt-1 text-sm text-white/70">Comanda {pedido.numero} · {nomeDoCliente(pedido)}</p></div><button type="button" onClick={onFechar} className="text-2xl text-white/70">×</button></div><div className="p-6"><p className="text-sm text-muted">Confira o que o cliente pediu, o peso da balança de cada item e o valor final. Para dar desconto a este cliente, use “Alterar preço” no item.</p><div className="mt-4 overflow-hidden rounded-lg border border-border"><div className="hidden grid-cols-5 gap-3 bg-background px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted sm:grid"><span>Carne</span><span>Pediu</span><span>Balança</span><span>Preço</span><span className="text-right">Subtotal</span></div><div className="divide-y divide-border">{pedido.itens.map((item) => <div key={item.id} className="px-4 py-3"><div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5 sm:gap-3"><div><p className="font-semibold text-ink">{item.produto?.nome}</p><p className="text-xs text-muted sm:hidden">Pediu: {textoPedido(item)} · Balança: {textoReal(item)} · {precoPorUnidade(item)}</p></div><span className="hidden text-muted sm:block">{textoPedido(item)}</span><span className="hidden text-success sm:block">{textoReal(item)}</span><span className="hidden text-muted sm:block">{precoPorUnidade(item)}</span><span className="col-span-2 text-right font-semibold text-ink sm:col-span-1">{formatarMoeda(item.subtotal)}</span></div><AlterarPrecoItem compacto pedido={pedido} item={item} onAtualizado={onAtualizado} /></div>)}{ehEntrega ? <div className="flex flex-col gap-3 bg-background px-4 py-4"><CampoTaxaEntrega valor={taxaTexto} onChange={setTaxaTexto} id="taxa-fechamento" /><ResumoComTaxa produtos={valorProdutos(pedido)} taxa={taxaFinal} /></div> : <div className="flex items-center justify-between bg-background px-4 py-4"><span className="font-semibold text-ink">Valor final da nota</span><span className="font-display text-3xl text-gold-texto">{formatarMoeda(pedido.total)}</span></div>}</div></div><div className="mt-6 rounded-lg border-2 border-primary/20 bg-primary/5 p-5"><p className="font-display text-2xl uppercase text-ink">Condição de pagamento</p><p className="mt-1 text-sm text-muted">Escolha como o cliente vai pagar esta comanda.</p><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><button type="button" onClick={() => setForma("NO_RECEBIMENTO")} className={`rounded-lg border p-4 text-left ${forma === "NO_RECEBIMENTO" ? "border-primary bg-white" : "border-border bg-surface"}`}><p className="font-semibold text-ink">Cobrar na entrega / retirada</p><p className="mt-1 text-xs text-muted">Maquininha com o motoboy ou no balcão</p></button><button type="button" onClick={() => setForma("DINHEIRO")} className={`rounded-lg border p-4 text-left ${forma !== "A_PRAZO" && forma !== "NO_RECEBIMENTO" ? "border-primary bg-white" : "border-border bg-surface"}`}><p className="font-semibold text-ink">Pagamento à vista</p><p className="mt-1 text-xs text-muted">Receber agora</p></button><button type="button" onClick={() => setForma("A_PRAZO")} className={`rounded-lg border p-4 text-left ${forma === "A_PRAZO" ? "border-primary bg-white" : "border-border bg-surface"}`}><p className="font-semibold text-ink">Pagamento posterior</p><p className="mt-1 text-xs text-muted">Lançar em contas a receber</p></button></div>{aVista && <div className="mt-4">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Quantas formas de pagamento">
          <button type="button" aria-pressed={!dividir} onClick={() => setDividir(false)} className={`min-h-11 rounded-lg border-2 px-3 text-sm font-semibold ${!dividir ? "border-primary bg-white text-primary" : "border-border bg-surface text-ink"}`}>Uma forma</button>
          <button type="button" aria-pressed={dividir} onClick={() => { setDividir(true); if (!valor1) setValor1((totalComanda / 2).toFixed(2)); }} className={`min-h-11 rounded-lg border-2 px-3 text-sm font-semibold ${dividir ? "border-primary bg-white text-primary" : "border-border bg-surface text-ink"}`}>➗ Duas formas<span className="block text-[11px] font-normal text-muted">ex.: cartão + dinheiro</span></button>
        </div>
        {!dividir ? <div className="mt-3"><label htmlFor="forma-a-vista" className="text-sm font-medium text-ink">Forma à vista</label><select id="forma-a-vista" value={forma} onChange={(e) => setForma(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm">{OPCOES_A_VISTA.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></div>
        : <div className="mt-3 rounded-lg border border-border bg-white p-4">
          <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0 sm:grid-cols-[1fr_11rem]">
            <div className="flex flex-col gap-1.5"><label htmlFor="forma-1" className="text-sm font-medium text-ink">1ª forma</label><select id="forma-1" value={forma1} onChange={(e) => setForma1(e.target.value)} className="h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm">{OPCOES_A_VISTA.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></div>
            <Input label="Valor (R$)" type="number" inputMode="decimal" step="0.01" min="0.01" className="w-full min-w-0" value={valor1} onChange={(e) => setValor1(e.target.value)} />
            <div className="flex flex-col gap-1.5"><label htmlFor="forma-2" className="text-sm font-medium text-ink">2ª forma</label><select id="forma-2" value={forma2} onChange={(e) => setForma2(e.target.value)} className="h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm">{OPCOES_A_VISTA.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></div>
            <div className="flex flex-col gap-1.5"><span className="text-sm font-medium text-ink">Valor (R$)</span><span className="flex h-11 items-center rounded-lg bg-background px-3.5 text-sm font-semibold text-ink" aria-live="polite">{formatarMoeda(parte2)}</span></div>
          </div>
          <p className="mt-3 text-xs text-muted">Digite quanto vai na 1ª forma; o restante ({formatarMoeda(parte2)}) vai na 2ª. Total da comanda: <strong className="text-ink">{formatarMoeda(totalComanda)}</strong>.</p>
          {forma1 === forma2 && <p className="mt-2 text-xs font-semibold text-danger">Escolha duas formas diferentes.</p>}
          {parte1 >= totalComanda && <p className="mt-2 text-xs font-semibold text-danger">A 1ª forma não pode ser o valor todo — use “Uma forma”.</p>}
        </div>}
      </div>}{forma === "A_PRAZO" && <div className="mt-3"><Input label="Data para pagamento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required /></div>}{erro && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}</div><div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variante="secundaria" onClick={onFechar}>Voltar para a comanda</Button><Button tamanho="grande" disabled={salvando} onClick={confirmar}>{salvando ? "Finalizando..." : "Fechar comanda (vai para Prontos)"}</Button></div></div></div></div>;
}


const OPCOES_A_VISTA = [
  { valor: "DINHEIRO", rotulo: "Dinheiro" },
  { valor: "PIX", rotulo: "Pix" },
  { valor: "CARTAO_DEBITO", rotulo: "💳 Débito" },
  { valor: "CARTAO_CREDITO", rotulo: "💳 Crédito" },
  { valor: "TRANSFERENCIA", rotulo: "Transferência" },
];

const UNIDADES_EDICAO: { valor: UnidadePedido; rotulo: string }[] = [
  { valor: "kg", rotulo: "kg" },
  { valor: "g", rotulo: "g" },
  { valor: "unidade", rotulo: "unidades" },
];

/** Edição da comanda antes do fechamento: incluir, alterar e remover carnes. */
function EditorComanda({ pedido, onAtualizado }: { pedido: Pedido; onAtualizado: (pedido: Pedido) => void }) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState<{ produto: Produto; quantidade: string; unidade: UnidadePedido; observacao: string } | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, { quantidade: string; unidade: UnidadePedido; observacao: string }>>({});
  const [salvando, setSalvando] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    api<Produto[]>("/produtos").then((lista) => setProdutos(lista.filter((produto) => produto.status === "ATIVO"))).catch(() => setErro("Não foi possível carregar as carnes."));
  }, []);

  const encontrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return [];
    return produtos.filter((produto) => `${produto.nome} ${produto.codigo}`.toLowerCase().includes(termo)).slice(0, 9);
  }, [busca, produtos]);

  function rascunhoDe(item: PedidoItem) {
    return rascunhos[item.id] ?? { quantidade: String(Number(item.pesoOuQtd)).replace(".", ","), unidade: (item.unidadePedido === "peca" || item.unidadePedido === "outra" ? "unidade" : item.unidadePedido) as UnidadePedido, observacao: item.observacao || "" };
  }

  async function executar(chave: string, acao: () => Promise<Pedido>) {
    setSalvando(chave);
    setErro("");
    try {
      onAtualizado(await acao());
      return true;
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível alterar a comanda.");
      return false;
    } finally {
      setSalvando("");
    }
  }

  async function salvarItem(item: PedidoItem) {
    const r = rascunhoDe(item);
    const quantidade = Number(r.quantidade.replace(",", "."));
    if (!quantidade || quantidade <= 0) return setErro("Informe a quantidade.");
    const ok = await executar(item.id, () => api<Pedido>(`/pedidos/${pedido.id}/itens/${item.id}`, { method: "PATCH", body: { pesoOuQtd: quantidade, unidadePedido: r.unidade, observacao: r.observacao.trim() || null } }));
    if (ok) setRascunhos((atual) => { const copia = { ...atual }; delete copia[item.id]; return copia; });
  }

  async function incluir() {
    if (!novo) return;
    const quantidade = Number(novo.quantidade.replace(",", "."));
    if (!quantidade || quantidade <= 0) return setErro("Informe a quantidade.");
    const ok = await executar("novo", () => api<Pedido>(`/pedidos/${pedido.id}/itens`, { method: "POST", body: { produtoId: novo.produto.id, pesoOuQtd: quantidade, unidadePedido: novo.unidade, observacao: novo.observacao.trim() || undefined } }));
    if (ok) { setNovo(null); setBusca(""); }
  }

  return <div className="space-y-3">
    {pedido.itens.map((item) => {
      const pesado = item.statusPreparo === "CORTADO";
      const r = rascunhoDe(item);
      const mudou = Boolean(rascunhos[item.id]);
      const atualizar = (parcial: Partial<typeof r>) => setRascunhos((atual) => ({ ...atual, [item.id]: { ...r, ...parcial } }));
      return <div key={item.id} className={`rounded-lg border p-4 ${pesado ? "border-success/30 bg-success/5" : "border-border"}`}>
        <div className="flex items-start justify-between gap-3"><p className="text-lg font-semibold text-ink">{item.produto?.nome}</p>{pesado ? <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Pesado · {textoReal(item)}</span> : <Button variante="fantasma" className="px-0 !text-danger" disabled={salvando === item.id} onClick={() => executar(item.id, () => api<Pedido>(`/pedidos/${pedido.id}/itens/${item.id}`, { method: "DELETE" }))}>Remover</Button>}</div>
        {pesado ? <p className="mt-1 text-sm text-muted">Pediu {textoPedido(item)}{item.observacao ? ` · ${item.observacao}` : ""}. Para mudar, feche a edição e use “Corrigir peso”.</p> : <div className="mt-3 grid gap-3 sm:grid-cols-[140px_150px_1fr]">
          <Input label="Quantidade" inputMode="decimal" value={r.quantidade} onChange={(e) => atualizar({ quantidade: e.target.value })} />
          <div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink" htmlFor={`un-${item.id}`}>Unidade</label><select id={`un-${item.id}`} value={r.unidade} onChange={(e) => atualizar({ unidade: e.target.value as UnidadePedido })} className="h-11 rounded-lg border border-border bg-white px-3 text-sm">{UNIDADES_EDICAO.map((unidade) => <option key={unidade.valor} value={unidade.valor}>{unidade.rotulo}</option>)}</select></div>
          <CampoObservacao valor={r.observacao} onMudar={(observacao) => atualizar({ observacao })} />
        </div>}
        {!pesado && mudou && <div className="mt-3 flex justify-end gap-2"><Button variante="secundaria" onClick={() => setRascunhos((atual) => { const copia = { ...atual }; delete copia[item.id]; return copia; })}>Desfazer</Button><Button disabled={salvando === item.id} onClick={() => salvarItem(item)}>{salvando === item.id ? "Salvando..." : "Salvar alteração"}</Button></div>}
      </div>;
    })}

    <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-4">
      <p className="font-semibold text-ink">+ Incluir carne na comanda</p>
      {!novo ? <><Input className="mt-3" placeholder="Buscar carne pelo nome ou código..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        {encontrados.length > 0 && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{encontrados.map((produto) => <button key={produto.id} type="button" onClick={() => setNovo({ produto, quantidade: "", unidade: produto.unidadeMedida.toLowerCase() === "un" ? "unidade" : "kg", observacao: "" })} className="rounded-lg border border-border bg-white px-3 py-2 text-left text-sm font-semibold text-ink hover:border-primary">{produto.nome}</button>)}</div>}
      </> : <div className="mt-3">
        <p className="text-sm text-ink"><strong>{novo.produto.nome}</strong> <button type="button" className="ml-2 text-xs font-semibold text-primary" onClick={() => setNovo(null)}>trocar</button></p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[140px_150px_1fr]">
          <Input label="Quantidade" inputMode="decimal" autoFocus value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} onKeyDown={(e) => e.key === "Enter" && incluir()} />
          <div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink" htmlFor="un-novo">Unidade</label><select id="un-novo" value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value as UnidadePedido })} className="h-11 rounded-lg border border-border bg-white px-3 text-sm">{UNIDADES_EDICAO.map((unidade) => <option key={unidade.valor} value={unidade.valor}>{unidade.rotulo}</option>)}</select></div>
          <CampoObservacao valor={novo.observacao} onMudar={(observacao) => setNovo({ ...novo, observacao })} />
        </div>
        <div className="mt-3 flex justify-end gap-2"><Button variante="secundaria" onClick={() => setNovo(null)}>Cancelar</Button><Button disabled={salvando === "novo"} onClick={incluir}>{salvando === "novo" ? "Incluindo..." : "Incluir na comanda"}</Button></div>
      </div>}
    </div>
    {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
  </div>;
}

/** Cancelamento (somente administrador), com motivo opcional. */
function ModalCancelamento({ pedido, onFechar, onCancelada }: { pedido: Pedido; onFechar: () => void; onCancelada: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const pago = (pedido.pagamentos || []).reduce((soma, pagamento) => soma + Number(pagamento.valor), 0);

  async function confirmar() {
    setSalvando(true);
    setErro("");
    try {
      await api(`/pedidos/${pedido.id}/cancelar`, { method: "PATCH", body: { motivo: motivo.trim() || undefined } });
      onCancelada();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível cancelar a comanda.");
    } finally {
      setSalvando(false);
    }
  }

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" onClick={onFechar}><div className="w-full max-w-md rounded-card bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
    <p className="font-display text-2xl uppercase text-danger">Cancelar comanda</p>
    <p className="mt-1 text-sm text-muted">Comanda {pedido.numero} · {nomeDoCliente(pedido)}</p>
    <p className="mt-4 text-sm text-ink">A comanda sai do painel e não entra nas vendas. Esta ação não pode ser desfeita.</p>
    {pago > 0 && <p className="mt-3 rounded-lg bg-gold/15 px-3 py-2 text-sm font-semibold text-ink">⚠ Já foram recebidos {formatarMoeda(pago)} nesta comanda. Faça a devolução ao cliente por fora do sistema.</p>}
    {pedido.contaReceber && <p className="mt-3 rounded-lg bg-background px-3 py-2 text-sm text-ink">A conta a receber desta venda também será cancelada.</p>}
    <div className="mt-4"><Input label="Motivo (opcional)" placeholder="Ex.: cliente desistiu" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
    {erro && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
    <div className="mt-5 flex justify-end gap-2"><Button variante="secundaria" onClick={onFechar}>Voltar</Button><Button className="bg-danger hover:bg-danger/90" disabled={salvando} onClick={confirmar}>{salvando ? "Cancelando..." : "Sim, cancelar comanda"}</Button></div>
  </div></div>;
}
