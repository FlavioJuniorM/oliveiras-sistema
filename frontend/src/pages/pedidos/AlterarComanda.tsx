import { useEffect, useState } from "react";
import { CampoTaxaEntrega, ResumoComTaxa, lerTaxa, taxaInicial, valorProdutos } from "./TaxaEntrega";
import { api, ErroApi } from "../../lib/api";
import { dataLocalISO, formatarDataCalendario, formatarMoeda } from "../../lib/formatadores";
import { Cliente, Pedido } from "../../types";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

type ModoPagamento = "DINHEIRO" | "PIX" | "CARTAO_DEBITO" | "CARTAO_CREDITO" | "TRANSFERENCIA" | "DIVIDIDO" | "A_PRAZO" | "NO_RECEBIMENTO";

const FORMAS_SIMPLES = [
  { valor: "DINHEIRO", rotulo: "💵 Dinheiro" },
  { valor: "PIX", rotulo: "⚡ Pix" },
  { valor: "CARTAO_DEBITO", rotulo: "💳 Débito" },
  { valor: "CARTAO_CREDITO", rotulo: "💳 Crédito" },
  { valor: "TRANSFERENCIA", rotulo: "🏦 Transferência" },
];

const OPCOES_PAGAMENTO: { valor: ModoPagamento; rotulo: string }[] = [
  { valor: "DINHEIRO", rotulo: "💵 Dinheiro" },
  { valor: "PIX", rotulo: "⚡ Pix" },
  { valor: "CARTAO_DEBITO", rotulo: "💳 Débito" },
  { valor: "CARTAO_CREDITO", rotulo: "💳 Crédito" },
  { valor: "TRANSFERENCIA", rotulo: "🏦 Transferência" },
  { valor: "DIVIDIDO", rotulo: "➗ Duas formas" },
  { valor: "A_PRAZO", rotulo: "📄 A prazo (paga depois)" },
  { valor: "NO_RECEBIMENTO", rotulo: "🛵 Cobrar na entrega / retirada" },
];

const NOMES_FORMA: Record<string, string> = {
  DINHEIRO: "dinheiro",
  PIX: "Pix",
  CARTAO_DEBITO: "cartão de débito",
  CARTAO_CREDITO: "cartão de crédito",
  TRANSFERENCIA: "transferência",
  BOLETO: "boleto",
  OUTROS: "outros",
};

function diasDepois(dias: number) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return dataLocalISO(data);
}

/** Como a comanda está sendo paga hoje, em português. */
export function descricaoPagamentoAtual(pedido: Pedido) {
  if (pedido.contaReceber) {
    const saldo = Number(pedido.contaReceber.saldo);
    return saldo <= 0.01
      ? "A prazo — já quitado"
      : `A prazo (paga depois) · vence ${formatarDataCalendario(pedido.contaReceber.vencimento)}`;
  }
  const pagamentos = pedido.pagamentos || [];
  const pago = pagamentos.reduce((soma, p) => soma + Number(p.valor), 0);
  if (pagamentos.length && pago >= Number(pedido.total) - 0.01) {
    return `Pago · ${[...new Set(pagamentos.map((p) => NOMES_FORMA[p.forma] ?? p.forma))].join(" + ")}`;
  }
  return pedido.tipoEntrega === "DELIVERY" ? "Cobrar na entrega (maquininha)" : "Cobrar na retirada";
}

function nomeCliente(c: Cliente) {
  return c.nomeFantasia || c.razaoSocial || c.nome;
}

/**
 * Corrige uma comanda já fechada (pronta, em rota, aguardando retirada ou entregue):
 * forma de pagamento — inclusive "a prazo, paga depois" —, cliente e retirada/entrega.
 * Com `concluirAoSalvar`, já marca como entregue/retirado depois de salvar.
 */
export function ModalAlterarComanda({
  pedido,
  onFechar,
  onAtualizado,
  pagamentoInicial,
  concluirAoSalvar = false,
}: {
  pedido: Pedido;
  onFechar: () => void;
  onAtualizado: (pedido: Pedido) => void;
  pagamentoInicial?: ModoPagamento;
  concluirAoSalvar?: boolean;
}) {
  const status = pedido.statusOperacao || "RECEBIDO";
  const entregue = status === "ENTREGUE";
  const [tipoEntrega, setTipoEntrega] = useState<"RETIRADA" | "DELIVERY">(pedido.tipoEntrega === "DELIVERY" ? "DELIVERY" : "RETIRADA");
  const [endereco, setEndereco] = useState(pedido.enderecoEntrega || pedido.cliente?.endereco || "");
  const [pagamento, setPagamento] = useState<ModoPagamento | null>(pagamentoInicial ?? null);
  const [vencimento, setVencimento] = useState(
    pedido.contaReceber?.vencimento?.slice(0, 10) || diasDepois(pedido.cliente?.prazoPadraoDias || 7)
  );
  const [cliente, setCliente] = useState<Cliente | null>(pedido.cliente ?? null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  // Duas formas: digita a 1ª parte, a 2ª é o restante
  // Taxa de entrega (só no delivery). Mudar a taxa muda o total da comanda.
  const [taxaTexto, setTaxaTexto] = useState(taxaInicial(pedido));
  const taxaLida = lerTaxa(taxaTexto);
  const taxaAtual = Number(pedido.taxaEntrega ?? 0);
  const total = tipoEntrega === "DELIVERY"
    ? Number((valorProdutos(pedido) + (taxaLida !== null && !Number.isNaN(taxaLida) ? taxaLida : 0)).toFixed(2))
    : valorProdutos(pedido);
  const [forma1, setForma1] = useState("CARTAO_DEBITO");
  const [valor1, setValor1] = useState((total / 2).toFixed(2));
  const [forma2, setForma2] = useState("DINHEIRO");
  const parte1 = Number(valor1.replace(",", ".")) || 0;
  const parte2 = Number(Math.max(total - parte1, 0).toFixed(2));

  const precisaCliente = pagamento === "A_PRAZO" && !cliente;

  useEffect(() => {
    if (!precisaCliente && !buscaCliente) return;
    const termo = buscaCliente.trim();
    if (termo.length < 2) return setClientes([]);
    const t = setTimeout(() => {
      api<Cliente[]>(`/clientes?busca=${encodeURIComponent(termo)}`).then(setClientes).catch(() => setClientes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [buscaCliente, precisaCliente]);

  const mudouEntrega = tipoEntrega !== (pedido.tipoEntrega === "DELIVERY" ? "DELIVERY" : "RETIRADA")
    || (tipoEntrega === "DELIVERY" && endereco.trim() !== (pedido.enderecoEntrega || ""));
  const mudouCliente = !!cliente && cliente.id !== pedido.cliente?.id;
  const taxaParaSalvar = tipoEntrega === "DELIVERY" ? (taxaLida !== null && !Number.isNaN(taxaLida) ? taxaLida : 0) : 0;
  const mudouTaxa = Math.abs(taxaParaSalvar - taxaAtual) > 0.004;
  const temMudanca = mudouEntrega || mudouCliente || mudouTaxa || pagamento !== null;

  async function salvar() {
    setErro("");
    if (tipoEntrega === "DELIVERY" && !endereco.trim()) return setErro("Informe o endereço de entrega.");
    if (tipoEntrega === "DELIVERY" && Number.isNaN(taxaLida)) return setErro("A taxa de entrega está inválida.");
    if (mudouTaxa && !pagamento && (pedido.pagamentos?.length || pedido.contaReceber)) return setErro("O total mudou por causa da taxa de entrega. Escolha também a forma de pagamento.");
    if (pagamento === "A_PRAZO" && !cliente) return setErro("Escolha o cliente que vai pagar depois.");
    if (pagamento === "A_PRAZO" && !vencimento) return setErro("Escolha a data em que o cliente vai pagar.");
    if (pagamento === "DIVIDIDO") {
      if (forma1 === forma2) return setErro("Escolha duas formas diferentes (ex.: cartão e dinheiro).");
      if (parte1 <= 0 || parte1 >= total) return setErro(`O valor da 1ª forma precisa ser maior que zero e menor que ${formatarMoeda(total)}.`);
    }

    const corpo: Record<string, unknown> = {};
    if (mudouEntrega) {
      corpo.tipoEntrega = tipoEntrega;
      if (tipoEntrega === "DELIVERY") corpo.enderecoEntrega = endereco.trim();
    }
    if (mudouCliente) corpo.clienteId = cliente!.id;
    if (mudouTaxa) corpo.taxaEntrega = taxaParaSalvar;
    if (pagamento === "A_PRAZO") corpo.pagamento = { modo: "A_PRAZO", vencimento };
    else if (pagamento === "NO_RECEBIMENTO") corpo.pagamento = { modo: "NO_RECEBIMENTO" };
    else if (pagamento === "DIVIDIDO") corpo.pagamento = { modo: "DIVIDIDO", partes: [{ forma: forma1, valor: Number(parte1.toFixed(2)) }, { forma: forma2, valor: parte2 }] };
    else if (pagamento) corpo.pagamento = { modo: "PAGO", forma: pagamento };

    setSalvando(true);
    try {
      let atualizado = await api<Pedido>(`/pedidos/${pedido.id}/alterar`, { method: "PATCH", body: corpo });
      if (concluirAoSalvar) {
        atualizado = await api<Pedido>(`/pedidos/${pedido.id}/status-operacao`, { method: "PATCH", body: { statusOperacao: "ENTREGUE" } });
      }
      onAtualizado(atualizado);
      onFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível alterar a comanda.");
    } finally {
      setSalvando(false);
    }
  }

  const botao = (ativo: boolean) =>
    `min-h-12 rounded-lg border-2 px-3 text-sm font-semibold transition ${ativo ? "border-primary bg-primary/[0.07] text-primary" : "border-border bg-white text-ink hover:border-primary/50"}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label="Alterar comanda" className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-card bg-surface p-5 shadow-2xl sm:rounded-card sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-2xl uppercase text-ink">{concluirAoSalvar ? "Pagar depois (a prazo)" : "Alterar comanda"}</p>
            <p className="mt-1 text-sm text-muted">Comanda {pedido.numero} · {formatarMoeda(pedido.total)}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 shrink-0 text-2xl text-muted">×</button>
        </div>

        {/* Pagamento */}
        <section className="mt-5">
          <p className="text-sm font-semibold text-ink">Forma de pagamento</p>
          <p className="mt-1 rounded-lg bg-background px-3 py-2 text-sm text-ink">Hoje está: <strong>{descricaoPagamentoAtual(pedido)}</strong></p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {OPCOES_PAGAMENTO.filter((o) => !(o.valor === "NO_RECEBIMENTO" && entregue)).map((opcao) => (
              <button key={opcao.valor} type="button" aria-pressed={pagamento === opcao.valor} onClick={() => setPagamento(pagamento === opcao.valor ? null : opcao.valor)} className={`${botao(pagamento === opcao.valor)} ${opcao.valor === "A_PRAZO" || opcao.valor === "NO_RECEBIMENTO" ? "col-span-2 sm:col-span-1" : ""}`}>
                {opcao.rotulo}
              </button>
            ))}
          </div>
          {pagamento === null && <p className="mt-2 text-xs text-muted">Nada marcado = o pagamento continua como está.</p>}
          {pagamento === "DIVIDIDO" && (
            <div className="mt-3 rounded-lg border-2 border-primary/20 bg-primary/[0.04] p-3">
              <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
                <div className="flex flex-col gap-1.5"><label htmlFor="alt-forma-1" className="text-sm font-medium text-ink">1ª forma</label><select id="alt-forma-1" value={forma1} onChange={(e) => setForma1(e.target.value)} className="h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm">{FORMAS_SIMPLES.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}</select></div>
                <Input label="Valor (R$)" type="number" inputMode="decimal" step="0.01" min="0.01" className="w-full min-w-0" value={valor1} onChange={(e) => setValor1(e.target.value)} />
                <div className="flex flex-col gap-1.5"><label htmlFor="alt-forma-2" className="text-sm font-medium text-ink">2ª forma</label><select id="alt-forma-2" value={forma2} onChange={(e) => setForma2(e.target.value)} className="h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm">{FORMAS_SIMPLES.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}</select></div>
                <div className="flex flex-col gap-1.5"><span className="text-sm font-medium text-ink">Valor (R$)</span><span className="flex h-11 items-center rounded-lg bg-white px-3.5 text-sm font-semibold text-ink" aria-live="polite">{formatarMoeda(parte2)}</span></div>
              </div>
              <p className="mt-2 text-xs text-muted">Digite quanto foi na 1ª forma; o restante vai na 2ª. Total: <strong className="text-ink">{formatarMoeda(total)}</strong>.</p>
              {forma1 === forma2 && <p className="mt-1 text-xs font-semibold text-danger">Escolha duas formas diferentes.</p>}
              {parte1 >= total && <p className="mt-1 text-xs font-semibold text-danger">A 1ª forma não pode ser o valor todo — escolha uma forma só.</p>}
            </div>
          )}
          {pagamento && pagamento !== "A_PRAZO" && pagamento !== "NO_RECEBIMENTO" && pagamento !== "DIVIDIDO" && <p className="mt-2 text-xs text-muted">Fica registrado como pago em {OPCOES_PAGAMENTO.find((o) => o.valor === pagamento)?.rotulo.replace(/^\S+\s/, "").toLowerCase()} ({formatarMoeda(pedido.total)}).</p>}

          {pagamento === "A_PRAZO" && (
            <div className="mt-3 rounded-lg border-2 border-primary/20 bg-primary/[0.04] p-3">
              {cliente ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <p className="text-ink">Cliente: <strong>{nomeCliente(cliente)}</strong></p>
                  <button type="button" onClick={() => { setCliente(null); setBuscaCliente(""); }} className="min-h-9 px-2 text-xs font-semibold text-primary underline">Trocar</button>
                </div>
              ) : (
                <div className="relative">
                  <Input label="Cliente que vai pagar depois" placeholder="Buscar por nome, telefone ou documento..." value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} autoFocus />
                  {clientes.length > 0 && (
                    <ul className="absolute left-0 right-0 z-10 mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-white shadow-xl">
                      {clientes.map((c) => (
                        <li key={c.id}><button type="button" onClick={() => { setCliente(c); setClientes([]); }} className="w-full px-3.5 py-2.5 text-left text-sm hover:bg-background"><span className="font-semibold text-ink">{nomeCliente(c)}</span><span className="block text-xs text-muted">{c.telefone || c.whatsapp || "Sem telefone"}</span></button></li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-muted">Venda a prazo precisa de cliente cadastrado (aparece em Contas a Receber).</p>
                </div>
              )}
              <div className="mt-3"><Input label="Vai pagar até" type="date" min={dataLocalISO()} value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></div>
              <p className="mt-2 text-xs text-ink">Os {formatarMoeda(pedido.total)} vão para <strong>Contas a Receber</strong> e saem do caixa do dia.</p>
            </div>
          )}
        </section>

        {/* Retirada ou entrega */}
        {!concluirAoSalvar && (
          <section className="mt-6 border-t border-border pt-5">
            <p className="text-sm font-semibold text-ink">Retirada ou entrega</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={tipoEntrega === "RETIRADA"} onClick={() => setTipoEntrega("RETIRADA")} className={botao(tipoEntrega === "RETIRADA")}>🏪 Retirada na loja</button>
              <button type="button" aria-pressed={tipoEntrega === "DELIVERY"} onClick={() => setTipoEntrega("DELIVERY")} className={botao(tipoEntrega === "DELIVERY")}>🛵 Entrega</button>
            </div>
            {tipoEntrega === "DELIVERY" && <div className="mt-3 flex flex-col gap-3"><Input label="Endereço de entrega" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro, complemento" /><CampoTaxaEntrega valor={taxaTexto} onChange={setTaxaTexto} id={`taxa-alterar-${pedido.id}`} /><ResumoComTaxa produtos={valorProdutos(pedido)} taxa={taxaParaSalvar} /></div>}
            {!entregue && mudouEntrega && (status === "AGUARDANDO_RETIRADA" || status === "EM_ENTREGA") && (
              <p className="mt-2 text-xs text-muted">A comanda passa para {tipoEntrega === "DELIVERY" ? "“Em rota”" : "“Retiradas”"}.</p>
            )}
          </section>
        )}

        {erro && <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variante="secundaria" onClick={onFechar}>Cancelar</Button>
          <Button tamanho="grande" disabled={salvando || !temMudanca} onClick={salvar}>
            {salvando ? "Salvando..." : concluirAoSalvar ? "Salvar e concluir entrega" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}
