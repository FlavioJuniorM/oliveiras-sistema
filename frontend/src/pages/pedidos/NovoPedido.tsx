import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { formatarMoeda } from "../../lib/formatadores";
import { Cliente, Produto, UnidadePedido } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { Card, CardTitulo } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

interface ItemCarrinho {
  produto: Produto;
  pesoOuQtd: number;
  unidadePedido: UnidadePedido;
}

const UNIDADES_PEDIDO: { valor: UnidadePedido; rotulo: string }[] = [
  { valor: "kg", rotulo: "Quilo (kg)" },
  { valor: "g", rotulo: "Gramas (g)" },
  { valor: "peca", rotulo: "Peça" },
  { valor: "unidade", rotulo: "Unidade" },
  { valor: "outra", rotulo: "Outra unidade" },
];

function unidadeInicial(produto: Produto): UnidadePedido {
  if (produto.unidadeMedida.toLowerCase() === "un") return "peca";
  if (produto.unidadeMedida.toLowerCase().includes("gram")) return "g";
  return "kg";
}

function chaveItem(item: ItemCarrinho) {
  return `${item.produto.id}:${item.unidadePedido}`;
}

function quantidadeParaPreco(item: ItemCarrinho) {
  return item.unidadePedido === "g" && item.produto.unidadeMedida.toLowerCase() === "kg"
    ? item.pesoOuQtd / 1000
    : item.pesoOuQtd;
}

export function NovoPedido() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const ehAdmin = usuario?.papel === "ADMINISTRATIVO";
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientesEncontrados, setClientesEncontrados] = useState<Cliente[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [produtoParaPesar, setProdutoParaPesar] = useState<Produto | null>(null);
  const [itemEditandoChave, setItemEditandoChave] = useState<string | null>(null);
  const [pesoDigitado, setPesoDigitado] = useState("");
  const [unidadeDigitada, setUnidadeDigitada] = useState<UnidadePedido>("kg");
  const [desconto, setDesconto] = useState("0");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pedidoCriado, setPedidoCriado] = useState<{ id: string; numero: string } | null>(null);

  useEffect(() => {
    api<Produto[]>("/produtos").then(setProdutos).catch(() => setErro("Não foi possível carregar as carnes."));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!buscaCliente.trim()) {
        setClientesEncontrados([]);
        return;
      }
      api<Cliente[]>(`/clientes?busca=${encodeURIComponent(buscaCliente)}`)
        .then(setClientesEncontrados)
        .catch(() => setClientesEncontrados([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [buscaCliente]);

  const produtosVisiveis = useMemo(() => {
    const termo = buscaProduto.toLowerCase();
    return produtos.filter((produto) => `${produto.nome} ${produto.codigo} ${produto.categoria?.nome || ""}`.toLowerCase().includes(termo));
  }, [buscaProduto, produtos]);

  const subtotalSolicitado = useMemo(() => carrinho.reduce((soma, item) => soma + Number(item.produto.preco) * quantidadeParaPreco(item), 0), [carrinho]);
  const descontoNumero = Number(desconto) || 0;
  const totalEstimado = Math.max(subtotalSolicitado - descontoNumero, 0);

  function abrirPesagem(produto: Produto, itemParaEditar?: ItemCarrinho) {
    setProdutoParaPesar(produto);
    setItemEditandoChave(itemParaEditar ? chaveItem(itemParaEditar) : null);
    setPesoDigitado(itemParaEditar ? String(itemParaEditar.pesoOuQtd) : "");
    setUnidadeDigitada(itemParaEditar?.unidadePedido || unidadeInicial(produto));
  }

  function fecharPesagem() {
    setProdutoParaPesar(null);
    setItemEditandoChave(null);
    setPesoDigitado("");
    setUnidadeDigitada("kg");
  }

  function confirmarPesagem() {
    const peso = Number(pesoDigitado.replace(",", "."));
    if (!produtoParaPesar || !peso || peso <= 0) return;
    setCarrinho((atual) => {
      if (itemEditandoChave) return atual.map((item) => chaveItem(item) === itemEditandoChave ? { ...item, pesoOuQtd: peso, unidadePedido: unidadeDigitada } : item);
      const existente = atual.find((item) => item.produto.id === produtoParaPesar.id && item.unidadePedido === unidadeDigitada);
      if (existente) return atual.map((item) => chaveItem(item) === chaveItem(existente) ? { ...item, pesoOuQtd: item.pesoOuQtd + peso } : item);
      return [...atual, { produto: produtoParaPesar, pesoOuQtd: peso, unidadePedido: unidadeDigitada }];
    });
    fecharPesagem();
  }

  async function salvarComanda() {
    setErro("");
    if (!clienteSelecionado) return setErro("Selecione o cliente da comanda ou cadastre-o antes de continuar.");
    if (carrinho.length === 0) return setErro("Adicione pelo menos uma carne ao pedido.");
    setEnviando(true);
    try {
      const pedido = await api<{ id: string; numero: string }>("/pedidos", {
        method: "POST",
        body: {
          clienteId: clienteSelecionado.id,
          itens: carrinho.map((item) => ({ produtoId: item.produto.id, pesoOuQtd: item.pesoOuQtd, unidadePedido: item.unidadePedido })),
          desconto: descontoNumero,
          pagamentos: [],
        },
      });
      setPedidoCriado(pedido);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Erro ao registrar a comanda.");
    } finally {
      setEnviando(false);
    }
  }

  function limparPedido() {
    setCarrinho([]);
    setClienteSelecionado(null);
    setBuscaCliente("");
    setDesconto("0");
    setPedidoCriado(null);
    setBuscaProduto("");
    setErro("");
  }

  if (pedidoCriado) {
    return <div className="mx-auto max-w-xl"><Card className="flex flex-col items-center gap-4 py-10 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-3xl font-bold text-success">✓</div><div><p className="text-sm text-muted">Comanda registrada e enviada para a fila de cortes</p><p className="mt-1 font-display text-4xl tracking-wide text-ink">{pedidoCriado.numero}</p><p className="mt-2 text-sm text-muted">Os açougueiros já podem abrir esta comanda em “Pedidos do dia”.</p></div><div className="flex w-full flex-col gap-3 sm:flex-row"><Button className="flex-1" onClick={() => navegar("/pedidos")}>Acompanhar pedido</Button><Button variante="secundaria" className="flex-1" onClick={limparPedido}>Registrar outro pedido</Button></div></Card></div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div><p className="text-sm text-muted">Atendimento por telefone ou WhatsApp</p><h2 className="mt-1 font-display text-3xl uppercase tracking-wide text-ink">Novo pedido</h2><p className="mt-2 max-w-3xl text-sm text-muted">Anote exatamente o que o cliente pediu. O peso real e o valor final serão confirmados pelo açougueiro depois do corte.</p></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Etapa numero="1" titulo="Identificar cliente" ativa={Boolean(clienteSelecionado)} /><Etapa numero="2" titulo="Anotar carnes e pesos" ativa={carrinho.length > 0} /><Etapa numero="3" titulo="Enviar para os cortes" ativa={Boolean(clienteSelecionado && carrinho.length > 0)} /></div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardTitulo>1. Quem fez o pedido?</CardTitulo>
            {clienteSelecionado ? <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-background px-4 py-3"><div><p className="font-semibold text-ink">{clienteSelecionado.nomeFantasia || clienteSelecionado.razaoSocial || clienteSelecionado.nome}</p><p className="mt-1 text-xs text-muted">{clienteSelecionado.telefone || clienteSelecionado.whatsapp || "Sem telefone informado"}</p>{clienteSelecionado.endereco && <p className="mt-1 text-xs text-muted">Entrega: {clienteSelecionado.endereco}</p>}</div><Button variante="fantasma" onClick={() => setClienteSelecionado(null)}>Trocar</Button></div> : <div className="relative mt-3"><Input placeholder="Buscar cliente por nome, telefone ou documento..." value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} autoFocus />{clientesEncontrados.length > 0 && <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-card">{clientesEncontrados.map((cliente) => <button key={cliente.id} type="button" onClick={() => { setClienteSelecionado(cliente); setClientesEncontrados([]); }} className="w-full px-4 py-3 text-left text-sm hover:bg-background"><p className="font-semibold text-ink">{cliente.nomeFantasia || cliente.razaoSocial || cliente.nome}</p><p className="mt-1 text-xs text-muted">{cliente.telefone || cliente.whatsapp || "Sem telefone"} · {cliente.endereco || "Sem endereço"}</p></button>)}</div>}<p className="mt-2 text-xs text-muted">Para pagamento posterior, o cliente precisa estar cadastrado.</p></div>}
          </Card>
          <Card>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><CardTitulo>2. O que o cliente pediu?</CardTitulo><p className="mt-1 text-sm text-muted">Ex.: 10 kg de costela, 5 kg de filé de frango ou 1 peça de picanha.</p></div><span className="text-sm font-semibold text-primary">{carrinho.length} {carrinho.length === 1 ? "item" : "itens"}</span></div>
            <Input className="mt-4" placeholder="Pesquisar carne por nome, código ou categoria..." value={buscaProduto} onChange={(e) => setBuscaProduto(e.target.value)} />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{produtosVisiveis.map((produto) => <button key={produto.id} type="button" onClick={() => abrirPesagem(produto)} className="balcao-tap flex min-h-24 flex-col items-start justify-between rounded-lg border border-border bg-white px-4 py-3 text-left transition hover:border-primary hover:shadow-card"><span className="text-sm font-semibold text-ink">{produto.nome}</span><span className="mt-2 text-sm font-bold text-gold">{formatarMoeda(produto.preco)}/{produto.unidadeMedida}</span></button>)}{produtosVisiveis.length === 0 && <p className="col-span-full py-5 text-sm text-muted">Nenhuma carne encontrada.</p>}</div>
          </Card>
        </div>
        <Card className="h-fit xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-3"><CardTitulo>3. Conferir anotação</CardTitulo><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Antes do corte</span></div>
          <div className="mt-3 divide-y divide-border">{carrinho.length === 0 && <p className="py-4 text-sm text-muted">Os itens anotados aparecerão aqui.</p>}{carrinho.map((item) => <div key={chaveItem(item)} className="flex items-start justify-between gap-3 py-3"><div><p className="font-semibold text-ink">{item.produto.nome}</p><p className="mt-1 text-sm text-muted">Solicitado: <strong className="text-ink">{item.pesoOuQtd} {item.unidadePedido}</strong></p><button type="button" onClick={() => abrirPesagem(item.produto, item)} className="mt-1 text-xs font-semibold text-primary">Editar pedido</button></div><button type="button" onClick={() => setCarrinho((atual) => atual.filter((atualItem) => chaveItem(atualItem) !== chaveItem(item)))} className="text-xs font-semibold text-danger">Remover</button></div>)}</div>
          {ehAdmin && <Input className="mt-3" label="Desconto combinado (R$)" type="number" min={0} step="0.01" value={desconto} onChange={(e) => setDesconto(e.target.value)} />}
          <div className="mt-4 border-t border-border pt-4"><div className="flex justify-between text-sm text-muted"><span>Valor estimado</span><span>{formatarMoeda(totalEstimado)}</span></div><p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-ink">O valor será recalculado quando cada corte receber o peso real.</p></div>
          {erro && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
          <Button className="mt-4 w-full" tamanho="grande" disabled={enviando || !clienteSelecionado || carrinho.length === 0} onClick={salvarComanda}>{enviando ? "Registrando..." : "Salvar comanda e enviar para cortes"}</Button>
        </Card>
      </div>
      {produtoParaPesar && <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4"><Card className="w-full max-w-sm"><CardTitulo>{itemEditandoChave ? "Editar pedido" : "Adicionar ao pedido"}</CardTitulo><p className="mt-1 text-sm text-muted">{produtoParaPesar.nome} · {formatarMoeda(produtoParaPesar.preco)}/{produtoParaPesar.unidadeMedida}</p><div className="mt-4 flex flex-col gap-3"><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Unidade do pedido</label><select value={unidadeDigitada} onChange={(e) => setUnidadeDigitada(e.target.value as UnidadePedido)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm">{UNIDADES_PEDIDO.map((unidade) => <option key={unidade.valor} value={unidade.valor}>{unidade.rotulo}</option>)}</select></div><Input label={unidadeDigitada === "kg" ? "Quantidade em quilos" : unidadeDigitada === "g" ? "Quantidade em gramas" : "Quantidade de peças/unidades"} inputMode="decimal" placeholder={unidadeDigitada === "g" ? "Ex.: 500" : "Ex.: 10 ou 1"} value={pesoDigitado} onChange={(e) => setPesoDigitado(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmarPesagem()} autoFocus /></div>{Number(pesoDigitado.replace(",", ".")) > 0 && <p className="mt-2 text-sm text-ink">Estimativa: <strong>{formatarMoeda(Number(produtoParaPesar.preco) * ((unidadeDigitada === "g" && produtoParaPesar.unidadeMedida.toLowerCase() === "kg") ? Number(pesoDigitado.replace(",", ".")) / 1000 : Number(pesoDigitado.replace(",", "."))))}</strong></p>}<div className="mt-4 flex gap-2"><Button variante="secundaria" className="flex-1" onClick={fecharPesagem}>Cancelar</Button><Button className="flex-1" onClick={confirmarPesagem}>{itemEditandoChave ? "Salvar alteração" : "Adicionar carne"}</Button></div></Card></div>}
    </div>
  );
}

function Etapa({ numero, titulo, ativa }: { numero: string; titulo: string; ativa: boolean }) {
  return <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${ativa ? "border-primary bg-primary/10" : "border-border bg-surface"}`}><span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${ativa ? "bg-primary text-white" : "bg-background text-muted"}`}>{ativa ? "✓" : numero}</span><span className={`text-sm font-semibold ${ativa ? "text-primary" : "text-muted"}`}>{titulo}</span></div>;
}
