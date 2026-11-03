import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card, CardSubtitulo, CardTitulo } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Produto, StatusOperacaoPedido, UnidadePedido } from "../../types";

const CHAVE_CARRINHO = "oliveiras_pedido_publico_carrinho";

interface ItemCarrinhoPublico {
  produto: Produto;
  pesoOuQtd: number;
  unidadePedido: UnidadePedido;
}

interface CriacaoPedidoPublico {
  numero: string;
  tokenAcompanhamento: string;
  statusOperacao: StatusOperacaoPedido;
  totalEstimado: string | number;
}

interface AcompanhamentoPublico {
  numero: string;
  tipoEntrega: "RETIRADA" | "DELIVERY";
  momentoPagamento: "NA_RETIRADA" | "NA_ENTREGA" | null;
  nomeCliente: string | null;
  criadoEm: string;
  subtotal: string | number;
  taxaEntrega: string | number;
  total: string | number;
  valorConfirmado?: boolean;
  statusPagamento: string;
  statusOperacao: StatusOperacaoPedido;
  enderecoEntrega: string | null;
  itens: {
    id: string;
    nome: string;
    pesoOuQtd: string | number;
    unidadePedido: string;
    pesoReal: string | number | null;
    unidadeReal?: string;
    subtotal: string | number;
    statusPreparo: string;
  }[];
  statusHistorico: { id: string; status: StatusOperacaoPedido; criadoEm: string; observacao: string | null }[];
}

const STATUS: Record<StatusOperacaoPedido, { titulo: string; descricao: string }> = {
  RECEBIDO: { titulo: "Pedido recebido", descricao: "A equipe recebeu seu pedido." },
  EM_PREPARO: { titulo: "Em preparo", descricao: "Os cortes estão sendo preparados." },
  EXPEDICAO: { titulo: "Em conferência", descricao: "O pedido está sendo embalado e conferido." },
  PRONTO: { titulo: "Pronto", descricao: "Seu pedido está pronto para retirada ou saída." },
  AGUARDANDO_RETIRADA: { titulo: "Pronto para retirada", descricao: "Seu pedido está pronto. Pode vir buscar na loja." },
  EM_ENTREGA: { titulo: "Em entrega", descricao: "O pedido saiu para entrega." },
  ENTREGUE: { titulo: "Concluído", descricao: "Pedido concluído. Obrigado!" },
};

function moeda(valor: string | number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function carregarCarrinho(): ItemCarrinhoPublico[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CARRINHO) || "[]") as ItemCarrinhoPublico[];
  } catch {
    return [];
  }
}

function salvarCarrinho(carrinho: ItemCarrinhoPublico[]) {
  localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho));
}

function unidadeInicial(produto: Produto): UnidadePedido {
  const unidade = produto.unidadeMedida.toLowerCase();
  if (unidade === "un" || unidade.includes("pec")) return "peca";
  if (unidade === "g" || unidade.includes("gram")) return "g";
  return "kg";
}

function quantidadeLabel(unidade: UnidadePedido) {
  if (unidade === "kg") return "Quantidade em kg";
  if (unidade === "g") return "Quantidade em gramas";
  if (unidade === "peca") return "Quantidade de peças";
  return "Quantidade";
}

function resumoCarrinho(carrinho: ItemCarrinhoPublico[]) {
  return carrinho.reduce((total, item) => {
    const quantidade = item.unidadePedido === "g" && item.produto.unidadeMedida.toLowerCase() === "kg"
      ? item.pesoOuQtd / 1000
      : item.pesoOuQtd;
    return total + Number(item.produto.preco) * quantidade;
  }, 0);
}

export function CatalogoPublico() {
  const navegar = useNavigate();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinhoPublico[]>(carregarCarrinho);
  const [busca, setBusca] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [unidades, setUnidades] = useState<Record<string, UnidadePedido>>({});
  const [erro, setErro] = useState("");

  useEffect(() => {
    api<Produto[]>("/publico/catalogo")
      .then(setProdutos)
      .catch(() => setErro("Não foi possível carregar o catálogo."));
  }, []);

  const produtosVisiveis = useMemo(() => {
    const termo = busca.toLowerCase();
    return produtos.filter((produto) => `${produto.nome} ${produto.categoria?.nome || ""}`.toLowerCase().includes(termo));
  }, [busca, produtos]);

  function adicionar(produto: Produto) {
    const unidade = unidades[produto.id] || unidadeInicial(produto);
    const quantidade = Number((quantidades[produto.id] || "").replace(",", "."));
    if (!quantidade || quantidade <= 0) {
      setErro(`Informe uma quantidade para ${produto.nome}.`);
      return;
    }

    const atualizados = [...carrinho];
    const existente = atualizados.find((item) => item.produto.id === produto.id && item.unidadePedido === unidade);
    if (existente) existente.pesoOuQtd += quantidade;
    else atualizados.push({ produto, pesoOuQtd: quantidade, unidadePedido: unidade });
    setCarrinho(atualizados);
    salvarCarrinho(atualizados);
    setErro("");
  }

  function remover(indice: number) {
    const atualizados = carrinho.filter((_item, itemIndex) => itemIndex !== indice);
    setCarrinho(atualizados);
    salvarCarrinho(atualizados);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Casa de Carnes Oliveiras</p>
            <h1 className="mt-2 font-display text-4xl uppercase tracking-wide text-ink">Faça seu pedido</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">Escolha seus cortes, informe a quantidade e finalize sem criar cadastro.</p>
          </div>
          <Link to="/login" className="text-sm font-semibold text-primary">Área da equipe →</Link>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <section>
            <Input label="Buscar no catálogo" placeholder="Ex.: picanha, costela, linguiça" value={busca} onChange={(evento) => setBusca(evento.target.value)} />
            {erro && <p className="mt-3 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {produtosVisiveis.map((produto) => {
                const unidade = unidades[produto.id] || unidadeInicial(produto);
                return (
                  <Card key={produto.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-xl uppercase tracking-wide text-ink">{produto.nome}</p>
                        <p className="mt-1 text-xs text-muted">{produto.categoria?.nome || "Cortes selecionados"}</p>
                      </div>
                      <p className="whitespace-nowrap font-semibold text-gold-texto">{moeda(produto.preco)}<span className="text-xs text-muted">/{produto.unidadeMedida}</span></p>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px]">
                      <Input label={quantidadeLabel(unidade)} type="number" min="0.001" step="0.001" placeholder={unidade === "g" ? "Ex.: 500" : "Ex.: 1"} value={quantidades[produto.id] || ""} onChange={(evento) => setQuantidades((atual) => ({ ...atual, [produto.id]: evento.target.value }))} />
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-ink">Unidade</label>
                        <select value={unidade} onChange={(evento) => setUnidades((atual) => ({ ...atual, [produto.id]: evento.target.value as UnidadePedido }))} className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink">
                          <option value="kg">kg</option><option value="g">g</option><option value="peca">peça</option><option value="unidade">unidade</option>
                        </select>
                      </div>
                    </div>
                    <Button className="mt-4 w-full" onClick={() => adicionar(produto)}>Adicionar ao pedido</Button>
                  </Card>
                );
              })}
            </div>
          </section>

          <Card className="h-fit lg:sticky lg:top-5">
            <CardTitulo>Seu pedido</CardTitulo>
            <CardSubtitulo className="mt-1">{carrinho.length} {carrinho.length === 1 ? "item" : "itens"}</CardSubtitulo>
            <div className="mt-4 divide-y divide-border">
              {carrinho.length === 0 && <p className="py-4 text-sm text-muted">Adicione cortes para continuar.</p>}
              {carrinho.map((item, indice) => <div key={`${item.produto.id}-${item.unidadePedido}`} className="flex items-start justify-between gap-3 py-3"><div><p className="font-semibold text-ink">{item.produto.nome}</p><p className="mt-1 text-xs text-muted">{item.pesoOuQtd} {item.unidadePedido}</p></div><button type="button" onClick={() => remover(indice)} className="text-xs font-semibold text-danger">Remover</button></div>)}
            </div>
            <div className="mt-4 border-t border-border pt-4"><div className="flex items-center justify-between"><span className="text-sm text-muted">Estimativa</span><strong className="text-lg text-ink">{moeda(resumoCarrinho(carrinho))}</strong></div><p className="mt-2 text-xs leading-5 text-muted">O valor final será confirmado após a pesagem real dos cortes.</p></div>
            <Button tamanho="grande" className="mt-4 w-full" disabled={carrinho.length === 0} onClick={() => navegar("/pedir/checkout")}>Continuar pedido</Button>
          </Card>
        </div>
      </div>
    </main>
  );
}

export function CheckoutPublico() {
  const navegar = useNavigate();
  const [carrinho] = useState<ItemCarrinhoPublico[]>(carregarCarrinho);
  const [nomeCliente, setNomeCliente] = useState("");
  const [telefoneCliente, setTelefoneCliente] = useState("");
  const [emailCliente, setEmailCliente] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState<"RETIRADA" | "DELIVERY">("RETIRADA");
  const [enderecoEntrega, setEnderecoEntrega] = useState("");
  const [observacoesCliente, setObservacoesCliente] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function finalizar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const resposta = await api<CriacaoPedidoPublico>("/publico/pedidos", {
        method: "POST",
        body: {
          nomeCliente,
          telefoneCliente,
          emailCliente: emailCliente || undefined,
          tipoEntrega,
          momentoPagamento: tipoEntrega === "DELIVERY" ? "NA_ENTREGA" : "NA_RETIRADA",
          enderecoEntrega: tipoEntrega === "DELIVERY" ? enderecoEntrega : undefined,
          observacoesCliente: observacoesCliente || undefined,
          itens: carrinho.map((item) => ({ produtoId: item.produto.id, pesoOuQtd: item.pesoOuQtd, unidadePedido: item.unidadePedido })),
        },
      });
      localStorage.removeItem(CHAVE_CARRINHO);
      navegar(`/acompanhar/${resposta.tokenAcompanhamento}`, { replace: true });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível enviar o pedido.");
    } finally {
      setEnviando(false);
    }
  }

  if (carrinho.length === 0) {
    return <main className="min-h-screen bg-background px-4 py-10"><div className="mx-auto max-w-xl"><Card className="text-center"><h1 className="font-display text-3xl uppercase text-ink">Seu carrinho está vazio</h1><p className="mt-2 text-sm text-muted">Escolha seus cortes antes de finalizar.</p><Link to="/pedir" className="mt-6 inline-flex font-semibold text-primary">Voltar ao catálogo →</Link></Card></div></main>;
  }

  return <main className="min-h-screen bg-background px-4 py-6 sm:px-8"><div className="mx-auto max-w-5xl"><Link to="/pedir" className="text-sm font-semibold text-primary">← Voltar ao catálogo</Link><div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]"><Card><p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Última etapa</p><h1 className="mt-2 font-display text-4xl uppercase text-ink">Dados para receber o pedido</h1><p className="mt-2 text-sm text-muted">Não é necessário criar uma conta.</p><form onSubmit={finalizar} className="mt-6 grid gap-4 sm:grid-cols-2"><Input label="Seu nome" required value={nomeCliente} onChange={(evento) => setNomeCliente(evento.target.value)} /><Input label="WhatsApp / telefone" required value={telefoneCliente} onChange={(evento) => setTelefoneCliente(evento.target.value)} /><Input label="E-mail (opcional)" type="email" value={emailCliente} onChange={(evento) => setEmailCliente(evento.target.value)} /><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Como receber</label><select value={tipoEntrega} onChange={(evento) => setTipoEntrega(evento.target.value as "RETIRADA" | "DELIVERY")} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="RETIRADA">Retirar na loja</option><option value="DELIVERY">Receber por delivery</option></select></div>{tipoEntrega === "DELIVERY" && <Input label="Endereço completo" required value={enderecoEntrega} onChange={(evento) => setEnderecoEntrega(evento.target.value)} className="sm:col-span-2" />}{tipoEntrega === "RETIRADA" ? <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-ink sm:col-span-2"><strong>Pagamento na retirada</strong><p className="mt-1 text-muted">Pague quando buscar seu pedido na loja.</p></div> : <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-ink sm:col-span-2"><strong>Pagamento na entrega</strong><p className="mt-1 text-muted">Pague quando receber o pedido.</p></div>}<label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-medium text-ink">Observações (opcional)</span><textarea rows={4} maxLength={500} value={observacoesCliente} onChange={(evento) => setObservacoesCliente(evento.target.value)} className="rounded-lg border border-border bg-white px-3.5 py-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Ex.: cortar em bifes, tocar interfone..." /></label>{erro && <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger sm:col-span-2">{erro}</p>}<Button tamanho="grande" type="submit" disabled={enviando} className="sm:col-span-2">{enviando ? "Enviando pedido..." : "Confirmar pedido"}</Button></form></Card><Card className="h-fit"><CardTitulo>Resumo</CardTitulo><div className="mt-4 divide-y divide-border">{carrinho.map((item) => <div key={`${item.produto.id}-${item.unidadePedido}`} className="flex justify-between gap-3 py-3 text-sm"><span className="text-muted">{item.produto.nome}<br /><small>{item.pesoOuQtd} {item.unidadePedido}</small></span><strong className="text-ink">{moeda(Number(item.produto.preco) * (item.unidadePedido === "g" && item.produto.unidadeMedida === "kg" ? item.pesoOuQtd / 1000 : item.pesoOuQtd))}</strong></div>)}</div><div className="mt-4 flex justify-between border-t border-border pt-4"><span className="text-sm text-muted">Estimativa</span><strong className="text-lg text-ink">{moeda(resumoCarrinho(carrinho))}</strong></div></Card></div></div></main>;
}

export function AcompanhamentoPedido() {
  const { token } = useParams<{ token: string }>();
  const [pedido, setPedido] = useState<AcompanhamentoPublico | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!token) return;
    let ativo = true;
    async function carregar() {
      try {
        const resposta = await api<AcompanhamentoPublico>(`/publico/pedidos/${token}`);
        if (ativo) { setPedido(resposta); setErro(""); }
      } catch (e) {
        if (ativo) setErro(e instanceof ErroApi ? e.message : "Não foi possível consultar o pedido.");
      }
    }
    carregar();
    const intervalo = window.setInterval(carregar, 10000);
    return () => { ativo = false; window.clearInterval(intervalo); };
  }, [token]);

  if (erro) return <main className="min-h-screen bg-background px-4 py-10"><div className="mx-auto max-w-xl"><Card className="text-center"><h1 className="font-display text-3xl uppercase text-ink">Pedido não encontrado</h1><p className="mt-2 text-sm text-danger">{erro}</p><Link to="/pedir" className="mt-6 inline-flex font-semibold text-primary">Fazer um novo pedido →</Link></Card></div></main>;
  if (!pedido) return <main className="min-h-screen bg-background px-4 py-10"><div className="mx-auto max-w-xl"><Card className="text-center"><p className="text-sm text-muted">Carregando acompanhamento...</p></Card></div></main>;

  const status = STATUS[pedido.statusOperacao];
  return <main className="min-h-screen bg-background px-4 py-6 sm:px-8"><div className="mx-auto max-w-4xl"><Link to="/pedir" className="text-sm font-semibold text-primary">← Fazer outro pedido</Link><Card className="mt-5 overflow-hidden p-0"><div className="bg-ink px-6 py-7 text-white"><p className="text-sm uppercase tracking-[0.2em] text-white/60">Acompanhamento</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-4xl uppercase">Pedido {pedido.numero}</h1><p className="mt-1 text-sm text-white/70">Olá, {pedido.nomeCliente || "cliente"}. Atualizamos esta página automaticamente.</p></div><span className="rounded-full bg-primary px-4 py-2 text-sm font-semibold">{status.titulo}</span></div></div><div className="p-6"><div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="font-semibold text-ink">{status.descricao}</p><p className="mt-1 text-xs text-muted">{pedido.tipoEntrega === "DELIVERY" ? "Delivery" : "Retirada na loja"} · Pagamento {pedido.momentoPagamento === "NA_ENTREGA" ? "na entrega" : "na retirada"}</p></div><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]"><div><h2 className="font-display text-2xl uppercase text-ink">Itens do pedido</h2><div className="mt-3 divide-y divide-border rounded-lg border border-border">{pedido.itens.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3"><div><p className="font-semibold text-ink">{item.nome}</p><p className="mt-1 text-xs text-muted">Solicitado: {item.pesoOuQtd} {item.unidadePedido}{item.pesoReal != null ? ` · Pesado: ${Number(item.pesoReal).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${item.unidadeReal || "kg"}` : ""}</p></div><strong className="text-sm text-ink">{item.statusPreparo === "CORTADO" ? moeda(item.subtotal) : "—"}</strong></div>)}</div></div><div><h2 className="font-display text-2xl uppercase text-ink">Linha do tempo</h2><div className="mt-3 space-y-4">{pedido.statusHistorico.map((evento) => <div key={evento.id} className="flex gap-3"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${evento.status === pedido.statusOperacao ? "bg-primary" : "bg-success"}`} /><div><p className="text-sm font-semibold text-ink">{STATUS[evento.status]?.titulo || evento.status}</p><p className="text-xs text-muted">{new Date(evento.criadoEm).toLocaleString("pt-BR")}</p></div></div>)}</div></div></div><div className="mt-6 flex items-center justify-between border-t border-border pt-4"><span className="text-sm text-muted">{pedido.valorConfirmado ? "Valor do pedido" : "Valor confirmado após a pesagem"}</span><strong className="font-display text-3xl text-gold-texto">{pedido.valorConfirmado ? moeda(pedido.total) : "—"}</strong></div>{pedido.enderecoEntrega && <p className="mt-3 text-sm text-muted">Entrega em: <strong className="text-ink">{pedido.enderecoEntrega}</strong></p>}</div></Card></div></main>;
}
