import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { Cliente, Produto, UnidadePedido } from "../../types";
import { Card, CardTitulo } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { formatarQuantidadePedido } from "../../lib/formatadores";
import { abrirJanelaImpressao, imprimirNaJanela, imprimirPedidoTermico } from "../../lib/impressao";

interface ItemCarrinho {
  produto: Produto;
  pesoOuQtd: number;
  unidadePedido: UnidadePedido;
}

// Como o cliente pediu. O valor só é calculado depois, com o peso da balança.
const UNIDADES_PEDIDO: { valor: UnidadePedido; rotulo: string }[] = [
  { valor: "kg", rotulo: "Quilos (kg)" },
  { valor: "g", rotulo: "Gramas (g)" },
  { valor: "unidade", rotulo: "Unidades / peças" },
];

function unidadeInicial(produto: Produto): UnidadePedido {
  if (produto.unidadeMedida.toLowerCase() === "un") return "unidade";
  if (produto.unidadeMedida.toLowerCase().includes("gram")) return "g";
  return "kg";
}

function chaveItem(item: ItemCarrinho) {
  return `${item.produto.id}:${item.unidadePedido}`;
}

export function NovoPedido() {
  const navegar = useNavigate();
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
  const [buscaConcluida, setBuscaConcluida] = useState(false);
  const [novoCliente, setNovoCliente] = useState<{ nome: string; telefone: string; endereco: string; tipo: "PESSOA_FISICA" | "EMPRESA" } | null>(null);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pedidoCriado, setPedidoCriado] = useState<{ id: string; numero: string } | null>(null);
  const [avisoImpressao, setAvisoImpressao] = useState("");

  useEffect(() => {
    api<Produto[]>("/produtos").then(setProdutos).catch(() => setErro("Não foi possível carregar as carnes."));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setBuscaConcluida(false);
      if (!buscaCliente.trim()) {
        setClientesEncontrados([]);
        return;
      }
      api<Cliente[]>(`/clientes?busca=${encodeURIComponent(buscaCliente)}`)
        .then(setClientesEncontrados)
        .catch(() => setClientesEncontrados([]))
        .finally(() => setBuscaConcluida(true));
    }, 300);
    return () => clearTimeout(timeout);
  }, [buscaCliente]);

  const produtosVisiveis = useMemo(() => {
    const termo = buscaProduto.toLowerCase();
    return produtos.filter((produto) => `${produto.nome} ${produto.codigo} ${produto.categoria?.nome || ""}`.toLowerCase().includes(termo));
  }, [buscaProduto, produtos]);

  function abrirCadastroCliente() {
    const texto = buscaCliente.trim();
    const pareceTelefone = /^[\d\s()+-]{8,}$/.test(texto);
    setNovoCliente({ nome: pareceTelefone ? "" : texto, telefone: pareceTelefone ? texto : "", endereco: "", tipo: "PESSOA_FISICA" });
    setErro("");
  }

  async function salvarNovoCliente() {
    if (!novoCliente) return;
    if (novoCliente.nome.trim().length < 2) return setErro("Informe o nome do cliente.");
    setSalvandoCliente(true);
    setErro("");
    try {
      const telefone = novoCliente.telefone.trim() || undefined;
      const cliente = await api<Cliente>("/clientes", {
        method: "POST",
        body: { tipo: novoCliente.tipo, nome: novoCliente.nome.trim(), telefone, whatsapp: telefone, endereco: novoCliente.endereco.trim() || undefined },
      });
      setClienteSelecionado(cliente);
      setNovoCliente(null);
      setBuscaCliente("");
      setClientesEncontrados([]);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível cadastrar o cliente.");
    } finally {
      setSalvandoCliente(false);
    }
  }

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

  async function salvarComanda(imprimir: boolean) {
    setErro("");
    setAvisoImpressao("");
    if (!clienteSelecionado) return setErro("Selecione o cliente da comanda ou cadastre-o antes de continuar.");
    if (carrinho.length === 0) return setErro("Adicione pelo menos uma carne ao pedido.");
    // Abre a janela já no clique, senão o navegador bloqueia a impressão
    const janela = imprimir ? abrirJanelaImpressao() : null;
    setEnviando(true);
    try {
      const pedido = await api<{ id: string; numero: string }>("/pedidos", {
        method: "POST",
        body: {
          clienteId: clienteSelecionado.id,
          itens: carrinho.map((item) => ({ produtoId: item.produto.id, pesoOuQtd: item.pesoOuQtd, unidadePedido: item.unidadePedido })),
        },
      });
      setPedidoCriado(pedido);
      if (imprimir) {
        imprimirNaJanela(janela, pedido.id, "corte").catch((e) => setAvisoImpressao(e instanceof Error ? e.message : "Não foi possível imprimir."));
      }
    } catch (e) {
      janela?.close();
      setErro(e instanceof ErroApi ? e.message : "Erro ao registrar a comanda.");
    } finally {
      setEnviando(false);
    }
  }

  function limparPedido() {
    setCarrinho([]);
    setClienteSelecionado(null);
    setBuscaCliente("");
    setNovoCliente(null);
    setPedidoCriado(null);
    setAvisoImpressao("");
    setBuscaProduto("");
    setErro("");
  }

  if (pedidoCriado) {
    return <div className="mx-auto max-w-xl"><Card className="flex flex-col items-center gap-4 py-10 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-3xl font-bold text-success">✓</div><div><p className="text-sm text-muted">Comanda registrada e enviada para a fila de cortes</p><p className="mt-1 font-display text-4xl tracking-wide text-ink">{pedidoCriado.numero}</p><p className="mt-2 text-sm text-muted">Os açougueiros já podem abrir esta comanda em “Pedidos do dia”.</p></div>{avisoImpressao && <p className="w-full rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{avisoImpressao}</p>}<Button variante="secundaria" className="w-full" onClick={() => { setAvisoImpressao(""); imprimirPedidoTermico(pedidoCriado.id, "corte").catch((e) => setAvisoImpressao(e instanceof Error ? e.message : "Não foi possível imprimir.")); }}>Imprimir pedido para os cortes</Button><div className="flex w-full flex-col gap-3 sm:flex-row"><Button className="flex-1" onClick={() => navegar("/pedidos")}>Acompanhar pedido</Button><Button variante="secundaria" className="flex-1" onClick={limparPedido}>Registrar outro pedido</Button></div></Card></div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div><p className="text-sm text-muted">Atendimento por telefone ou WhatsApp</p><h2 className="mt-1 font-display text-3xl uppercase tracking-wide text-ink">Novo pedido</h2><p className="mt-2 max-w-3xl text-sm text-muted">Anote exatamente o que o cliente pediu. Aqui não existe valor: o valor da comanda só aparece depois que cada corte é pesado.</p></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Etapa numero="1" titulo="Identificar cliente" ativa={Boolean(clienteSelecionado)} /><Etapa numero="2" titulo="Anotar carnes e pesos" ativa={carrinho.length > 0} /><Etapa numero="3" titulo="Imprimir e enviar para os cortes" ativa={Boolean(clienteSelecionado && carrinho.length > 0)} /></div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardTitulo>1. Quem fez o pedido?</CardTitulo>
            {clienteSelecionado ? <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-background px-4 py-3"><div><p className="font-semibold text-ink">{clienteSelecionado.nomeFantasia || clienteSelecionado.razaoSocial || clienteSelecionado.nome}</p><p className="mt-1 text-xs text-muted">{clienteSelecionado.telefone || clienteSelecionado.whatsapp || "Sem telefone informado"}</p>{clienteSelecionado.endereco && <p className="mt-1 text-xs text-muted">Entrega: {clienteSelecionado.endereco}</p>}</div><Button variante="fantasma" onClick={() => setClienteSelecionado(null)}>Trocar</Button></div> : <div className="relative mt-3"><Input placeholder="Buscar cliente por nome, telefone ou documento..." value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} autoFocus />{clientesEncontrados.length > 0 && <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-card">{clientesEncontrados.map((cliente) => <button key={cliente.id} type="button" onClick={() => { setClienteSelecionado(cliente); setClientesEncontrados([]); }} className="w-full px-4 py-3 text-left text-sm hover:bg-background"><p className="font-semibold text-ink">{cliente.nomeFantasia || cliente.razaoSocial || cliente.nome}</p><p className="mt-1 text-xs text-muted">{cliente.telefone || cliente.whatsapp || "Sem telefone"} · {cliente.endereco || "Sem endereço"}</p></button>)}</div>}{buscaConcluida && buscaCliente.trim() && clientesEncontrados.length === 0 && !novoCliente && <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-3"><p className="text-sm text-ink">Nenhum cliente encontrado para “{buscaCliente.trim()}”.</p><Button onClick={abrirCadastroCliente}>Cadastrar cliente</Button></div>}{!novoCliente && !(buscaConcluida && buscaCliente.trim() && clientesEncontrados.length === 0) && <button type="button" onClick={abrirCadastroCliente} className="mt-2 text-xs font-semibold text-primary">+ Cliente novo? Cadastrar agora</button>}{novoCliente && <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-4"><p className="text-sm font-semibold text-ink">Cadastro rápido de cliente</p><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><Input label="Nome *" value={novoCliente.nome} onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} autoFocus /><Input label="Telefone / WhatsApp" inputMode="tel" value={novoCliente.telefone} onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })} /><div className="sm:col-span-2"><Input label="Endereço de entrega (opcional)" value={novoCliente.endereco} onChange={(e) => setNovoCliente({ ...novoCliente, endereco: e.target.value })} /></div><div className="flex gap-2 sm:col-span-2">{(["PESSOA_FISICA", "EMPRESA"] as const).map((tipo) => <button key={tipo} type="button" onClick={() => setNovoCliente({ ...novoCliente, tipo })} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${novoCliente.tipo === tipo ? "border-primary bg-white text-primary" : "border-border bg-surface text-muted"}`}>{tipo === "PESSOA_FISICA" ? "Pessoa física" : "Empresa / restaurante"}</button>)}</div></div><div className="mt-3 flex gap-2"><Button variante="secundaria" onClick={() => setNovoCliente(null)}>Cancelar</Button><Button disabled={salvandoCliente} onClick={salvarNovoCliente}>{salvandoCliente ? "Salvando..." : "Salvar e usar neste pedido"}</Button></div></div>}</div>}
          </Card>
          <Card>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><CardTitulo>2. O que o cliente pediu?</CardTitulo><p className="mt-1 text-sm text-muted">Ex.: 10 kg de costela, 500 g de moída ou 15 unidades de bife de contra filé.</p></div><span className="text-sm font-semibold text-primary">{carrinho.length} {carrinho.length === 1 ? "item" : "itens"}</span></div>
            <Input className="mt-4" placeholder="Pesquisar carne por nome, código ou categoria..." value={buscaProduto} onChange={(e) => setBuscaProduto(e.target.value)} />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{produtosVisiveis.map((produto) => <button key={produto.id} type="button" onClick={() => abrirPesagem(produto)} className="balcao-tap flex min-h-24 flex-col items-start justify-between rounded-lg border border-border bg-white px-4 py-3 text-left transition hover:border-primary hover:shadow-card"><span className="text-sm font-semibold text-ink">{produto.nome}</span><span className="mt-2 text-xs font-semibold text-primary">Toque para anotar</span></button>)}{produtosVisiveis.length === 0 && <p className="col-span-full py-5 text-sm text-muted">Nenhuma carne encontrada.</p>}</div>
          </Card>
        </div>
        <Card className="h-fit xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-3"><CardTitulo>3. Conferir anotação</CardTitulo><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Antes do corte</span></div>
          <div className="mt-3 divide-y divide-border">{carrinho.length === 0 && <p className="py-4 text-sm text-muted">Os itens anotados aparecerão aqui.</p>}{carrinho.map((item) => <div key={chaveItem(item)} className="flex items-start justify-between gap-3 py-3"><div><p className="font-semibold text-ink">{item.produto.nome}</p><p className="mt-1 text-sm text-muted">Pediu: <strong className="text-ink">{formatarQuantidadePedido(item.pesoOuQtd, item.unidadePedido)}</strong></p><button type="button" onClick={() => abrirPesagem(item.produto, item)} className="mt-1 text-xs font-semibold text-primary">Editar pedido</button></div><button type="button" onClick={() => setCarrinho((atual) => atual.filter((atualItem) => chaveItem(atualItem) !== chaveItem(item)))} className="text-xs font-semibold text-danger">Remover</button></div>)}</div>
          <div className="mt-4 border-t border-border pt-4"><p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-ink">Sem valor nesta etapa. Depois do corte, o peso da balança de cada item gera o valor da comanda.</p></div>
          {erro && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
          <Button className="mt-4 w-full" tamanho="grande" disabled={enviando || !clienteSelecionado || carrinho.length === 0} onClick={() => salvarComanda(true)}>{enviando ? "Registrando..." : "Salvar e imprimir para o balcão"}</Button><Button variante="secundaria" className="mt-2 w-full" disabled={enviando || !clienteSelecionado || carrinho.length === 0} onClick={() => salvarComanda(false)}>Salvar sem imprimir</Button><p className="mt-2 text-center text-xs text-muted">Impressão térmica 58 mm, sem valores — para os açougueiros.</p>
        </Card>
      </div>
      {produtoParaPesar && <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4"><Card className="w-full max-w-sm"><CardTitulo>{itemEditandoChave ? "Editar pedido" : "Adicionar ao pedido"}</CardTitulo><p className="mt-1 text-sm text-muted">{produtoParaPesar.nome}</p><div className="mt-4 flex flex-col gap-3"><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Unidade do pedido</label><select value={unidadeDigitada} onChange={(e) => setUnidadeDigitada(e.target.value as UnidadePedido)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm">{UNIDADES_PEDIDO.map((unidade) => <option key={unidade.valor} value={unidade.valor}>{unidade.rotulo}</option>)}</select></div><Input label={unidadeDigitada === "kg" ? "Quantos quilos?" : unidadeDigitada === "g" ? "Quantos gramas?" : "Quantas unidades / peças?"} inputMode="decimal" placeholder={unidadeDigitada === "g" ? "Ex.: 500" : unidadeDigitada === "kg" ? "Ex.: 2,5" : "Ex.: 15"} value={pesoDigitado} onChange={(e) => setPesoDigitado(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmarPesagem()} autoFocus />{unidadeDigitada === "unidade" && produtoParaPesar.tipoVenda === "PESO" && <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-ink">Anotado em unidades, mas cobrado pelo <strong>peso da balança</strong> depois do corte.</p>}</div><div className="mt-4 flex gap-2"><Button variante="secundaria" className="flex-1" onClick={fecharPesagem}>Cancelar</Button><Button className="flex-1" onClick={confirmarPesagem}>{itemEditandoChave ? "Salvar alteração" : "Adicionar carne"}</Button></div></Card></div>}
    </div>
  );
}

function Etapa({ numero, titulo, ativa }: { numero: string; titulo: string; ativa: boolean }) {
  return <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${ativa ? "border-primary bg-primary/10" : "border-border bg-surface"}`}><span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${ativa ? "bg-primary text-white" : "bg-background text-muted"}`}>{ativa ? "✓" : numero}</span><span className={`text-sm font-semibold ${ativa ? "text-primary" : "text-muted"}`}>{titulo}</span></div>;
}
