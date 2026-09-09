import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { formatarMoeda } from "../../lib/formatadores";
import { Cliente, Produto } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { Card, CardTitulo } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

interface ItemCarrinho {
  produto: Produto;
  pesoOuQtd: number;
}

interface PagamentoLinha {
  forma: string;
  valor: number;
}

const FORMAS_PAGAMENTO = [
  { valor: "DINHEIRO", rotulo: "Dinheiro" },
  { valor: "PIX", rotulo: "Pix" },
  { valor: "CARTAO_DEBITO", rotulo: "Débito" },
  { valor: "CARTAO_CREDITO", rotulo: "Crédito" },
  { valor: "TRANSFERENCIA", rotulo: "Transferência" },
  { valor: "BOLETO", rotulo: "Boleto" },
  { valor: "OUTROS", rotulo: "Outros" },
];

export function NovoPedido() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const ehAdmin = usuario?.papel === "ADMINISTRATIVO";

  // Cliente
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientesEncontrados, setClientesEncontrados] = useState<Cliente[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);

  // Produtos e carrinho
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [produtoParaPesar, setProdutoParaPesar] = useState<Produto | null>(null);
  const [itemEditandoId, setItemEditandoId] = useState<string | null>(null);
  const [pesoDigitado, setPesoDigitado] = useState("");

  // Desconto e pagamento
  const [desconto, setDesconto] = useState("0");
  const [pagamentos, setPagamentos] = useState<PagamentoLinha[]>([]);
  const [formaAtual, setFormaAtual] = useState("DINHEIRO");
  const [valorAtual, setValorAtual] = useState("");
  const [vencimentoAPrazo, setVencimentoAPrazo] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pedidoCriado, setPedidoCriado] = useState<{ id: string; numero: string } | null>(null);

  useEffect(() => {
    api<Produto[]>("/produtos").then(setProdutos);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (buscaCliente.trim().length === 0) {
        setClientesEncontrados([]);
        return;
      }
      api<Cliente[]>(`/clientes?busca=${encodeURIComponent(buscaCliente)}`).then(setClientesEncontrados);
    }, 300);
    return () => clearTimeout(timeout);
  }, [buscaCliente]);

  const subtotal = useMemo(
    () => carrinho.reduce((soma, item) => soma + Number(item.produto.preco) * item.pesoOuQtd, 0),
    [carrinho]
  );
  const descontoNumero = Number(desconto) || 0;
  const total = Math.max(subtotal - descontoNumero, 0);
  const totalPagoImediato = pagamentos.reduce((s, p) => s + p.valor, 0);
  const saldoRestante = Number((total - totalPagoImediato).toFixed(2));
  const pedidoEmAberto = pagamentos.length === 0 && !vencimentoAPrazo;
  const produtosVisiveis = useMemo(() => produtos.filter((produto) => `${produto.nome} ${produto.codigo} ${produto.categoria?.nome || ""}`.toLowerCase().includes(buscaProduto.toLowerCase())), [buscaProduto, produtos]);

  function abrirPesagem(produto: Produto, itemId?: string) {
    setProdutoParaPesar(produto);
    setItemEditandoId(itemId || null);
    const item = itemId ? carrinho.find((atual) => atual.produto.id === itemId) : undefined;
    setPesoDigitado(item ? String(item.pesoOuQtd) : "");
  }

  function confirmarPesagem() {
    const peso = Number(pesoDigitado.replace(",", "."));
    if (!produtoParaPesar || !peso || peso <= 0) return;

    setCarrinho((atual) => {
      if (itemEditandoId) {
        return atual.map((item) => item.produto.id === itemEditandoId ? { ...item, pesoOuQtd: peso } : item);
      }
      const existente = atual.find((i) => i.produto.id === produtoParaPesar.id);
      if (existente) {
        return atual.map((i) =>
          i.produto.id === produtoParaPesar.id ? { ...i, pesoOuQtd: i.pesoOuQtd + peso } : i
        );
      }
      return [...atual, { produto: produtoParaPesar, pesoOuQtd: peso }];
    });
    setProdutoParaPesar(null);
    setItemEditandoId(null);
  }

  function removerItem(produtoId: string) {
    setCarrinho((atual) => atual.filter((i) => i.produto.id !== produtoId));
  }

  function adicionarPagamento() {
    const valor = Number(valorAtual.replace(",", "."));
    if (!valor || valor <= 0) return;
    setPagamentos((atual) => [...atual, { forma: formaAtual, valor }]);
    setValorAtual("");
  }

  function removerPagamento(indice: number) {
    setPagamentos((atual) => atual.filter((_, i) => i !== indice));
  }

  async function finalizarPedido() {
    setErro("");

    if (carrinho.length === 0) {
      setErro("Adicione ao menos um produto ao pedido.");
      return;
    }
    if (!pedidoEmAberto && saldoRestante > 0.01 && !vencimentoAPrazo) {
      setErro("Informe o vencimento para a parte do pedido a prazo.");
      return;
    }
    if (!pedidoEmAberto && saldoRestante > 0.01 && !clienteSelecionado) {
      setErro("Vendas a prazo exigem um cliente cadastrado — selecione um cliente.");
      return;
    }

    setEnviando(true);
    try {
      const pedido = await api<{ id: string; numero: string }>("/pedidos", {
        method: "POST",
        body: {
          clienteId: clienteSelecionado?.id,
          itens: carrinho.map((i) => ({ produtoId: i.produto.id, pesoOuQtd: i.pesoOuQtd })),
          desconto: descontoNumero,
          pagamentos: pagamentos.map((p) => ({ forma: p.forma, valor: p.valor })),
          valorAPrazo: saldoRestante > 0.01 ? saldoRestante : undefined,
          vencimento: saldoRestante > 0.01 ? vencimentoAPrazo : undefined,
        },
      });
      setPedidoCriado(pedido);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Erro ao finalizar o pedido.");
    } finally {
      setEnviando(false);
    }
  }

  function novoPedido() {
    setCarrinho([]);
    setClienteSelecionado(null);
    setBuscaCliente("");
    setDesconto("0");
    setPagamentos([]);
    setVencimentoAPrazo("");
    setPedidoCriado(null);
    setBuscaProduto("");
  }

  if (pedidoCriado) {
    return (
      <div className="max-w-md mx-auto text-center">
        <Card className="flex flex-col items-center gap-4 py-10">
          <div className="h-14 w-14 rounded-full bg-success/10 flex items-center justify-center text-success text-2xl font-bold">
            ✓
          </div>
          <div>
            <p className="text-muted text-sm">Comanda recebida e enviada para preparo</p>
            <p className="font-display text-3xl text-ink tracking-wide">{pedidoCriado.numero}</p>
          </div>
          <div className="flex gap-3 w-full">
            <a
              href={`${import.meta.env.VITE_API_URL || "http://localhost:3333"}/pedidos/${pedidoCriado.id}/impressao?formato=termica80`}
              target="_blank"
              rel="noreferrer"
              className="flex-1"
            >
              <Button variante="secundaria" className="w-full">Imprimir térmica</Button>
            </a>
            <a
              href={`${import.meta.env.VITE_API_URL || "http://localhost:3333"}/pedidos/${pedidoCriado.id}/impressao?formato=a4`}
              target="_blank"
              rel="noreferrer"
              className="flex-1"
            >
              <Button variante="secundaria" className="w-full">Imprimir A4 / PDF</Button>
            </a>
          </div>
          <Button onClick={novoPedido} tamanho="grande" className="w-full">
            Novo pedido
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div><p className="text-muted text-sm">Abertura de comanda · acompanhe cada etapa antes de enviar</p><h2 className="font-display text-3xl uppercase tracking-wide text-ink mt-1">Novo pedido</h2></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4"><Etapa numero="1" titulo="Cliente" ativa={Boolean(clienteSelecionado)} /><Etapa numero="2" titulo="Carnes e pesos" ativa={carrinho.length > 0} /><Etapa numero="3" titulo="Conferência" ativa={carrinho.length > 0} /><Etapa numero="4" titulo="Pagamento" ativa={pagamentos.length > 0 || Boolean(vencimentoAPrazo)} /></div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Coluna principal: cliente + produtos */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        <Card>
          <CardTitulo>1. Cliente</CardTitulo>
          {clienteSelecionado ? (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-background px-4 py-3">
              <div>
                <p className="font-medium text-ink">{clienteSelecionado.nome}</p>
                {clienteSelecionado.documento && (
                  <p className="text-xs text-muted">{clienteSelecionado.documento}</p>
                )}
                {clienteSelecionado.endereco && <p className="text-xs text-muted mt-1">Entrega: {clienteSelecionado.endereco}</p>}
              </div>
              <Button variante="fantasma" onClick={() => setClienteSelecionado(null)}>
                Trocar
              </Button>
            </div>
          ) : (
            <div className="mt-3 relative">
              <Input
                placeholder="Buscar por nome, CPF/CNPJ ou telefone... (opcional)"
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
              />
              {clientesEncontrados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-white shadow-card max-h-56 overflow-y-auto">
                  {clientesEncontrados.map((cliente) => (
                    <button
                      key={cliente.id}
                      onClick={() => {
                        setClienteSelecionado(cliente);
                        setClientesEncontrados([]);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-background text-sm"
                    >
                      <p className="font-medium text-ink">{cliente.nome}</p>
                      {cliente.documento && <p className="text-xs text-muted">{cliente.documento}</p>}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted mt-2">
                Sem cliente cadastrado? Pode deixar em branco para venda avulsa (não permite venda a prazo).
              </p>
            </div>
          )}
        </Card>

        <Card>
          <CardTitulo>2. Selecione as carnes</CardTitulo>
          <Input className="mt-3" placeholder="Pesquisar carne por nome, código ou categoria..." value={buscaProduto} onChange={(e) => setBuscaProduto(e.target.value)} />
          <p className="mt-2 text-xs text-muted">Toque em uma carne para informar o peso ou a quantidade.</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {produtosVisiveis.map((produto) => (
              <button
                key={produto.id}
                onClick={() => abrirPesagem(produto)}
                className="balcao-tap flex flex-col items-start rounded-lg border border-border bg-white px-4 py-3 text-left hover:border-primary hover:shadow-card"
              >
                <span className="font-medium text-ink text-sm">{produto.nome}</span>
                <span className="text-gold font-semibold text-sm mt-1">
                  {formatarMoeda(produto.preco)}/{produto.unidadeMedida}
                </span>
              </button>
            ))}
            {produtosVisiveis.length === 0 && (
              <p className="text-muted text-sm col-span-full">Nenhum produto cadastrado ainda.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Coluna lateral: carrinho e pagamento */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardTitulo>Pedido</CardTitulo>
          <div className="mt-3 flex flex-col divide-y divide-border">
            {carrinho.length === 0 && (
              <p className="text-muted text-sm py-3">Nenhum item adicionado ainda.</p>
            )}
            {carrinho.map((item) => (
              <div key={item.produto.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink">{item.produto.nome}</p>
                  <p className="text-xs text-muted">
                    {item.pesoOuQtd} {item.produto.unidadeMedida} ×{" "}
                    {formatarMoeda(item.produto.preco)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {formatarMoeda(Number(item.produto.preco) * item.pesoOuQtd)}
                  </p>
                  <div className="flex flex-col items-end gap-1"><button onClick={() => abrirPesagem(item.produto, item.produto.id)} className="text-primary text-xs font-medium">editar peso</button><button onClick={() => removerItem(item.produto.id)} className="text-danger text-xs font-medium">remover</button></div>
                </div>
              </div>
            ))}
          </div>

          {ehAdmin && (
            <div className="mt-3">
              <Input
                label="Desconto (R$)"
                type="number"
                min={0}
                step="0.01"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
              />
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border flex flex-col gap-1">
            <div className="flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span>{formatarMoeda(subtotal)}</span>
            </div>
            {descontoNumero > 0 && (
              <div className="flex justify-between text-sm text-muted">
                <span>Desconto</span>
                <span>-{formatarMoeda(descontoNumero)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline mt-1">
              <span className="font-medium text-ink">Total</span>
              <span className="font-display text-2xl text-gold tracking-wide">
                {formatarMoeda(total)}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitulo>4. Pagamento (opcional na entrada)</CardTitulo>
          <div className="mt-3 flex flex-col gap-2">
            {pagamentos.map((p, indice) => (
              <div
                key={indice}
                className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm"
              >
                <span className="text-ink font-medium">
                  {FORMAS_PAGAMENTO.find((f) => f.valor === p.forma)?.rotulo}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-ink">{formatarMoeda(p.valor)}</span>
                  <button onClick={() => removerPagamento(indice)} className="text-danger text-xs">
                    remover
                  </button>
                </div>
              </div>
            ))}

            <div className="flex gap-2 mt-1">
              <select
                value={formaAtual}
                onChange={(e) => setFormaAtual(e.target.value)}
                className="h-11 rounded-lg border border-border bg-white px-2 text-sm flex-1"
              >
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.rotulo}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Valor"
                value={valorAtual}
                onChange={(e) => setValorAtual(e.target.value)}
                className="w-28"
              />
              <Button variante="secundaria" onClick={adicionarPagamento}>
                +
              </Button>
            </div>

            {pagamentos.length === 0 && (
              <div className="mt-2 rounded-lg bg-primary/10 px-3 py-3 text-sm text-ink">
                Você pode salvar a comanda agora e confirmar o valor final depois que os cortes forem pesados.
              </div>
            )}

            {pagamentos.length > 0 && saldoRestante > 0.01 && (
              <div className="mt-2 rounded-lg bg-gold/10 px-3 py-3">
                <p className="text-sm font-medium text-ink">
                  Saldo a prazo: {formatarMoeda(saldoRestante)}
                </p>
                <div className="mt-2">
                  <Input
                    label="Vencimento"
                    type="date"
                    value={vencimentoAPrazo}
                    onChange={(e) => setVencimentoAPrazo(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {erro && <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2 mt-3">{erro}</p>}

          <Button
            className="w-full mt-4"
            tamanho="grande"
            disabled={enviando || carrinho.length === 0}
            onClick={finalizarPedido}
          >
            {enviando ? "Salvando..." : pedidoEmAberto ? "Salvar comanda e enviar para preparo" : "Finalizar pedido"}
          </Button>
        </Card>
      </div>

      </div>

      {/* Modal simples de pesagem */}
      {produtoParaPesar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30 px-4">
          <Card className="w-full max-w-sm">
            <CardTitulo>{produtoParaPesar.nome}</CardTitulo>
            <p className="text-muted text-sm mt-1">
              {formatarMoeda(produtoParaPesar.preco)}/{produtoParaPesar.unidadeMedida}
            </p>
            <div className="mt-4">
              <Input
                label={`${produtoParaPesar.tipoVenda === "PESO" ? "Peso (kg)" : "Quantidade"}`}
                autoFocus
                inputMode="decimal"
                placeholder="0,000"
                value={pesoDigitado}
                onChange={(e) => setPesoDigitado(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmarPesagem()}
              />
            </div>
            {Number(pesoDigitado.replace(",", ".")) > 0 && (
              <p className="mt-2 text-sm text-ink">
                Subtotal:{" "}
                <strong>
                  {formatarMoeda(
                    Number(produtoParaPesar.preco) * Number(pesoDigitado.replace(",", "."))
                  )}
                </strong>
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <Button variante="secundaria" className="flex-1" onClick={() => { setProdutoParaPesar(null); setItemEditandoId(null); }}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={confirmarPesagem}>
                {itemEditandoId ? "Salvar peso" : "Adicionar carne"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Etapa({ numero, titulo, ativa }: { numero: string; titulo: string; ativa: boolean }) {
  return <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${ativa ? "border-primary bg-primary/10" : "border-border bg-surface"}`}><span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${ativa ? "bg-primary text-white" : "bg-background text-muted"}`}>{ativa ? "✓" : numero}</span><span className={`text-sm font-semibold ${ativa ? "text-primary" : "text-muted"}`}>{titulo}</span></div>;
}
