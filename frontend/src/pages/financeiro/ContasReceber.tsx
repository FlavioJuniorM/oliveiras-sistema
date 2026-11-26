import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { dataLocalISO, formatarDataCalendario, formatarDataHora, formatarMoeda } from "../../lib/formatadores";
import { Pedido } from "../../types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

const NOMES_FORMA_RECEBER: Record<string, string> = { DINHEIRO: "Dinheiro", PIX: "Pix", CARTAO_DEBITO: "Cartão de débito", CARTAO_CREDITO: "Cartão de crédito", TRANSFERENCIA: "Transferência", BOLETO: "Boleto", OUTROS: "Outros", A_PRAZO: "A prazo" };

type Situacao = "abertas" | "recebidas" | "canceladas";

function nomeCliente(pedido: Pedido) { return pedido.cliente?.nomeFantasia || pedido.cliente?.razaoSocial || pedido.cliente?.nome || pedido.nomeCliente || "Consumidor final"; }
function normalizar(texto: string) { return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function diasAteVencer(vencimento: string) { return Math.round((Date.parse(vencimento.slice(0, 10) + "T00:00:00Z") - Date.parse(dataLocalISO() + "T00:00:00Z")) / 86_400_000); }
function textoPrazo(vencimento: string) {
  const d = diasAteVencer(vencimento);
  if (d === 0) return "vence hoje";
  if (d > 0) return `vence em ${d} dia${d > 1 ? "s" : ""}`;
  return `vencida há ${-d} dia${d < -1 ? "s" : ""}`;
}

export function ContasReceber() {
  const [situacao, setSituacao] = useState<Situacao>("abertas");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Pedido | null>(null);
  const [erro, setErro] = useState("");

  async function carregar(qual = situacao) {
    setCarregando(true);
    try { setPedidos(await api<Pedido[]>(`/pedidos/a-receber?situacao=${qual}`)); setErro(""); }
    catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao carregar contas."); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(situacao); }, [situacao]);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return pedidos;
    return pedidos.filter((p) => normalizar(`${nomeCliente(p)} ${p.numero}`).includes(termo));
  }, [busca, pedidos]);

  const resumo = useMemo(() => {
    const emAberto = pedidos.reduce((t, p) => t + Number(p.contaReceber?.saldo ?? 0), 0);
    const vencidas = pedidos.filter((p) => p.contaReceber && diasAteVencer(p.contaReceber.vencimento) < 0);
    return {
      emAberto,
      vencidasQtd: vencidas.length,
      vencidasValor: vencidas.reduce((t, p) => t + Number(p.contaReceber?.saldo ?? 0), 0),
      clientes: new Set(pedidos.map((p) => nomeCliente(p))).size,
    };
  }, [pedidos]);

  const abas: { id: Situacao; nome: string }[] = [{ id: "abertas", nome: "Em aberto" }, { id: "recebidas", nome: "Recebidas" }, { id: "canceladas", nome: "Canceladas" }];

  return <div className="flex flex-col gap-5">
    <div role="tablist" aria-label="Situação das contas" className="grid grid-cols-3 rounded-xl border border-border bg-white p-1 sm:max-w-md">
      {abas.map((a) => <button key={a.id} type="button" role="tab" aria-selected={situacao === a.id} onClick={() => setSituacao(a.id)} className={`h-11 rounded-lg text-sm font-semibold ${situacao === a.id ? "bg-ink text-white" : "text-ink hover:bg-background"}`}>{a.nome}</button>)}
    </div>

    {situacao === "abertas" && <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Card><p className="text-xs text-muted">Total a receber</p><p className="mt-1 font-display text-2xl text-ink sm:text-3xl">{formatarMoeda(resumo.emAberto)}</p><p className="text-xs text-muted">{pedidos.length} comanda(s) · {resumo.clientes} cliente(s)</p></Card>
      <Card className={resumo.vencidasQtd > 0 ? "border-danger/40" : ""}><p className="text-xs text-muted">Vencidas</p><p className={`mt-1 font-display text-2xl sm:text-3xl ${resumo.vencidasQtd > 0 ? "text-danger" : "text-ink"}`}>{formatarMoeda(resumo.vencidasValor)}</p><p className="text-xs text-muted">{resumo.vencidasQtd} comanda(s)</p></Card>
      <Card className="hidden lg:block"><p className="text-xs text-muted">Dica</p><p className="mt-1 text-sm text-ink">Toque na conta para receber, mudar a data/valor ou cancelar. Se o cliente pagou direto na sua conta, marque “Recebido por fora do caixa”.</p></Card>
    </div>}

    <Input aria-label="Buscar" placeholder="Buscar por cliente ou número da comanda..." value={busca} onChange={(e) => setBusca(e.target.value)} />

    {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visiveis.map((pedido) => <CartaoConta key={pedido.id} pedido={pedido} situacao={situacao} onAbrir={() => setAberto(pedido)} />)}
      {!carregando && visiveis.length === 0 && <Card className="py-12 text-center md:col-span-2 xl:col-span-3"><p className="font-display text-2xl uppercase text-ink">{situacao === "abertas" ? "Nenhuma conta em aberto" : situacao === "recebidas" ? "Nenhuma conta recebida" : "Nenhuma conta cancelada"}</p>{busca && <p className="mt-1 text-sm text-muted">Nada encontrado para “{busca}”.</p>}</Card>}
    </div>

    {aberto && <ModalConta pedido={aberto} onFechar={() => setAberto(null)} onAtualizado={() => { setAberto(null); carregar(); }} />}
  </div>;
}

function CartaoConta({ pedido, situacao, onAbrir }: { pedido: Pedido; situacao: Situacao; onAbrir: () => void }) {
  const conta = pedido.contaReceber;
  const dias = conta ? diasAteVencer(conta.vencimento) : 0;
  const vencida = situacao === "abertas" && dias < 0;
  const pago = (pedido.pagamentos || []).reduce((t, p) => t + Number(p.valor), 0);
  const total = Number(conta?.valorOriginal ?? pedido.total);
  const pct = total > 0 ? Math.min(100, Math.round((pago / total) * 100)) : 0;
  return <button type="button" onClick={onAbrir} className={`flex flex-col rounded-card border bg-surface p-5 text-left shadow-card transition hover:border-primary ${vencida ? "border-danger/50" : "border-border"}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">{nomeCliente(pedido)}</p>
        <p className="text-xs text-muted">Comanda {pedido.numero} · {formatarDataHora(pedido.criadoEm).slice(0, 10)}</p>
      </div>
      {situacao === "abertas" && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${vencida ? "bg-danger/10 text-danger" : dias <= 3 ? "bg-gold/25 text-ink" : "bg-background text-muted"}`}>{conta ? textoPrazo(conta.vencimento) : "sem vencimento"}</span>}
      {situacao === "recebidas" && <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Recebida</span>}
      {situacao === "canceladas" && <span className="shrink-0 rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted">Cancelada</span>}
    </div>
    <div className="mt-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-xs text-muted">{situacao === "abertas" ? "Falta receber" : situacao === "recebidas" ? "Recebido" : "Ficou em aberto"}</p>
        <p className={`font-display text-2xl ${situacao === "abertas" ? (vencida ? "text-danger" : "text-ink") : situacao === "recebidas" ? "text-success" : "text-muted line-through"}`}>{formatarMoeda(situacao === "recebidas" ? pago : conta?.saldo ?? 0)}</p>
      </div>
      <p className="text-right text-xs text-muted">Nota {formatarMoeda(total)}<br />Vence {conta ? formatarDataCalendario(conta.vencimento) : "—"}</p>
    </div>
    {situacao === "abertas" && pago > 0 && <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-[11px] text-muted">Já recebeu {formatarMoeda(pago)} ({pct}%)</p></div>}
    {situacao === "canceladas" && conta?.motivoCancelamento && <p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-ink">Motivo: {conta.motivoCancelamento}</p>}
    <span className="mt-4 border-t border-border pt-3 text-sm font-semibold text-primary">{situacao === "abertas" ? "Receber / alterar / cancelar →" : "Ver detalhes →"}</span>
  </button>;
}

type Acao = "receber" | "alterar" | "cancelar";

function ModalConta({ pedido, onFechar, onAtualizado }: { pedido: Pedido; onFechar: () => void; onAtualizado: () => void }) {
  const conta = pedido.contaReceber;
  const status = conta?.status ?? "";
  const emAberto = ["PENDENTE", "PARCIAL", "VENCIDO"].includes(status);
  const [acao, setAcao] = useState<Acao>("receber");
  const pagamentos = pedido.pagamentos || [];
  const totalPago = pagamentos.reduce((total, p) => total + Number(p.valor), 0);

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [onFechar]);

  return <div className="fixed inset-0 z-40 overflow-y-auto bg-black/50 px-3 py-5 sm:px-6" onClick={onFechar}>
    <div role="dialog" aria-modal="true" aria-label={`Conta a receber ${pedido.numero}`} className="mx-auto max-w-3xl overflow-hidden rounded-card bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3 bg-ink px-5 py-4 text-white sm:px-6">
        <div className="min-w-0"><p className="truncate font-display text-2xl uppercase sm:text-3xl">{nomeCliente(pedido)}</p><p className="mt-0.5 text-sm text-white/70">Comanda {pedido.numero} · {formatarDataHora(pedido.criadoEm)}</p></div>
        <button type="button" aria-label="Fechar" onClick={onFechar} className="h-10 w-10 shrink-0 rounded-lg text-2xl text-white/70 hover:bg-white/10">×</button>
      </div>
      <div className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Bloco titulo="Valor da nota" valor={formatarMoeda(conta?.valorOriginal ?? pedido.total)} />
          <Bloco titulo="Já recebido" valor={formatarMoeda(totalPago)} cor="text-success" />
          <Bloco titulo="Falta receber" valor={formatarMoeda(emAberto ? conta?.saldo ?? 0 : 0)} cor={emAberto ? "text-danger" : "text-ink"} />
          <Bloco titulo="Vencimento" valor={conta ? formatarDataCalendario(conta.vencimento) : "—"} detalhe={emAberto && conta ? textoPrazo(conta.vencimento) : undefined} />
        </div>
        {conta?.observacoes && <p className="mt-3 rounded-lg bg-background px-3 py-2 text-sm text-ink">Obs.: {conta.observacoes}</p>}

        {status === "CANCELADO" && <AreaReabrir pedido={pedido} onAtualizado={onAtualizado} />}

        {emAberto && <div className="mt-5 rounded-xl border-2 border-border">
          <div role="tablist" aria-label="O que fazer" className="grid grid-cols-3 border-b border-border">
            {([["receber", "Receber"], ["alterar", "Alterar"], ["cancelar", "Cancelar"]] as [Acao, string][]).map(([id, nome]) => <button key={id} type="button" role="tab" aria-selected={acao === id} onClick={() => setAcao(id)} className={`h-12 text-sm font-semibold transition ${acao === id ? (id === "cancelar" ? "bg-danger/[0.07] text-danger shadow-[inset_0_-3px_0] shadow-danger" : "bg-primary/[0.06] text-primary shadow-[inset_0_-3px_0] shadow-primary") : "text-muted hover:bg-background"}`}>{nome}</button>)}
          </div>
          <div className="p-4 sm:p-5">
            {acao === "receber" && <FormReceber pedido={pedido} onAtualizado={onAtualizado} />}
            {acao === "alterar" && <FormAlterar pedido={pedido} onAtualizado={onAtualizado} />}
            {acao === "cancelar" && <FormCancelar pedido={pedido} onAtualizado={onAtualizado} />}
          </div>
        </div>}

        <div className="mt-5">
          <p className="text-sm font-semibold text-ink">Pagamentos recebidos</p>
          {pagamentos.length === 0 ? <p className="mt-1 text-sm text-muted">Nenhum pagamento ainda.</p> : <ul className="mt-1 divide-y divide-border rounded-lg border border-border text-sm">
            {pagamentos.map((pg) => <li key={pg.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0"><span className="text-ink">{formatarDataHora(pg.criadoEm).slice(0, 10)} · {NOMES_FORMA_RECEBER[pg.forma] ?? pg.forma}</span>
                {pg.foraDoCaixa && <span className="ml-2 rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-semibold text-ink">Por fora do caixa</span>}
                {pg.observacao && <span className="block text-xs text-muted">{pg.observacao}</span>}</span>
              <strong className="whitespace-nowrap text-ink">{formatarMoeda(pg.valor)}</strong>
            </li>)}
          </ul>}
        </div>

        <details className="mt-5 rounded-lg border border-border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">Produtos da comanda ({pedido.itens.length})</summary>
          <div className="divide-y divide-border border-t border-border">{pedido.itens.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"><div><p className="font-medium text-ink">{item.produto?.nome || "Produto"}</p><p className="text-xs text-muted">{Number(item.pesoReal ?? item.pesoOuQtd).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.produto?.unidadeMedida || "unidade"}</p></div><p className="font-semibold text-ink">{formatarMoeda(item.subtotal)}</p></div>)}</div>
          <div className="flex justify-between border-t border-border bg-background px-4 py-2.5 text-sm font-semibold text-ink"><span>Total</span><span>{formatarMoeda(pedido.total)}</span></div>
        </details>
      </div>
    </div>
  </div>;
}

function Bloco({ titulo, valor, cor = "text-ink", detalhe }: { titulo: string; valor: string; cor?: string; detalhe?: string }) {
  return <div className="rounded-lg bg-background px-3 py-2.5"><p className="text-xs text-muted">{titulo}</p><p className={`mt-0.5 font-display text-xl ${cor}`}>{valor}</p>{detalhe && <p className="text-[11px] text-muted">{detalhe}</p>}</div>;
}

function useEnvio(onAtualizado: () => void) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function enviar(fn: () => Promise<unknown>, padrao: string) {
    setErro(""); setEnviando(true);
    try { await fn(); onAtualizado(); }
    catch (e) { setErro(e instanceof ErroApi ? e.message : padrao); setEnviando(false); }
  }
  return { erro, enviando, enviar };
}

function FormReceber({ pedido, onAtualizado }: { pedido: Pedido; onAtualizado: () => void }) {
  const saldo = Number(pedido.contaReceber?.saldo ?? 0);
  const [valor, setValor] = useState(String(saldo));
  const [forma, setForma] = useState("PIX");
  const [dataRecebimento, setDataRecebimento] = useState(dataLocalISO());
  const [foraDoCaixa, setForaDoCaixa] = useState(false);
  const [observacao, setObservacao] = useState("");
  const { erro, enviando, enviar } = useEnvio(onAtualizado);
  const parcial = Number(valor) > 0 && Number(valor) < saldo - 0.009;

  function salvar(e: FormEvent) {
    e.preventDefault();
    enviar(() => api(`/pedidos/${pedido.id}/pagamentos`, { method: "POST", body: { forma, valor: Number(valor), dataRecebimento, foraDoCaixa, observacao: observacao.trim() || undefined } }), "Erro ao registrar o pagamento.");
  }

  return <form onSubmit={salvar} className="flex flex-col gap-4">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div><Input label="Valor recebido (R$)" type="number" inputMode="decimal" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required /><p className="mt-1 text-xs text-muted">{parcial ? `Parcial: ficam ${formatarMoeda(saldo - Number(valor))} em aberto` : "Quita a conta toda"}</p></div>
      <div className="flex flex-col gap-1.5"><label htmlFor="forma-receber" className="text-sm font-medium text-ink">Forma de pagamento</label><select id="forma-receber" value={forma} onChange={(e) => setForma(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="PIX">Pix</option><option value="DINHEIRO">Dinheiro</option><option value="CARTAO_DEBITO">Cartão de débito</option><option value="CARTAO_CREDITO">Cartão de crédito</option><option value="TRANSFERENCIA">Transferência</option><option value="BOLETO">Boleto</option><option value="OUTROS">Outros</option></select></div>
      <div><Input label="Data em que recebeu" type="date" value={dataRecebimento} max={dataLocalISO()} onChange={(e) => setDataRecebimento(e.target.value)} required /><p className="mt-1 text-xs text-muted">{dataRecebimento < dataLocalISO() ? `Entra no caixa de ${formatarDataCalendario(dataRecebimento)}` : "Recebido hoje"}</p></div>
    </div>
    <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${foraDoCaixa ? "border-gold bg-gold/10" : "border-border"}`}>
      <input type="checkbox" checked={foraDoCaixa} onChange={(e) => setForaDoCaixa(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
      <span><span className="block text-sm font-semibold text-ink">Recebido por fora do caixa da loja</span><span className="block text-xs text-muted">Ex.: o cliente pagou direto na sua conta ou acertou com outra pessoa. A conta é baixada, mas o valor não entra no fechamento do caixa (aparece separado, só para conferência).</span></span>
    </label>
    <Input label="Observação (opcional)" placeholder={foraDoCaixa ? "Ex.: Pix direto na conta do Flávio" : "Ex.: pagou com troco para 200"} value={observacao} maxLength={200} onChange={(e) => setObservacao(e.target.value)} />
    {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
    <Button type="submit" disabled={enviando} className="sm:self-end">{enviando ? "Registrando..." : parcial ? "Registrar pagamento parcial" : "Registrar e quitar"}</Button>
  </form>;
}

function FormAlterar({ pedido, onAtualizado }: { pedido: Pedido; onAtualizado: () => void }) {
  const conta = pedido.contaReceber!;
  const [vencimento, setVencimento] = useState(conta.vencimento.slice(0, 10));
  const [saldo, setSaldo] = useState(String(Number(conta.saldo)));
  const [observacoes, setObservacoes] = useState(conta.observacoes ?? "");
  const { erro, enviando, enviar } = useEnvio(onAtualizado);
  const diferenca = Number(saldo) - Number(conta.saldo);

  function salvar(e: FormEvent) {
    e.preventDefault();
    enviar(() => api(`/pedidos/${pedido.id}/conta-receber`, { method: "PUT", body: { vencimento, saldo: Number(saldo), observacoes: observacoes.trim() || null } }), "Erro ao alterar a conta.");
  }

  return <form onSubmit={salvar} className="flex flex-col gap-4">
    <p className="text-sm text-muted">Mude a data de vencimento ou o valor que falta receber (acerto, desconto combinado). O total da comanda continua o mesmo.</p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input label="Novo vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
      <div><Input label="Valor que falta receber (R$)" type="number" inputMode="decimal" min="0.01" step="0.01" value={saldo} onChange={(e) => setSaldo(e.target.value)} required />{Math.abs(diferenca) > 0.009 && <p className={`mt-1 text-xs ${diferenca < 0 ? "text-success" : "text-danger"}`}>{diferenca < 0 ? `Desconto de ${formatarMoeda(-diferenca)}` : `Acréscimo de ${formatarMoeda(diferenca)}`}</p>}</div>
    </div>
    <Input label="Observação (opcional)" placeholder="Ex.: combinado pagar em 2x" value={observacoes} maxLength={300} onChange={(e) => setObservacoes(e.target.value)} />
    {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
    <Button type="submit" disabled={enviando} className="sm:self-end">{enviando ? "Salvando..." : "Salvar alterações"}</Button>
  </form>;
}

function FormCancelar({ pedido, onAtualizado }: { pedido: Pedido; onAtualizado: () => void }) {
  const [motivo, setMotivo] = useState("");
  const { erro, enviando, enviar } = useEnvio(onAtualizado);
  const sugestoes = ["Lançado errado", "Cliente não vai pagar", "Acertado com mercadoria", "Pago antes do sistema"];
  function salvar(e: FormEvent) {
    e.preventDefault();
    enviar(() => api(`/pedidos/${pedido.id}/conta-receber/cancelar`, { method: "PATCH", body: { motivo } }), "Erro ao cancelar a conta.");
  }
  return <form onSubmit={salvar} className="flex flex-col gap-4">
    <p className="text-sm text-ink">A cobrança de <strong>{formatarMoeda(pedido.contaReceber?.saldo ?? 0)}</strong> sai de Contas a Receber e vai para a aba “Canceladas”. A venda continua registrada e dá para reabrir depois.</p>
    <div className="flex flex-wrap gap-2">{sugestoes.map((s) => <button key={s} type="button" onClick={() => setMotivo(s)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${motivo === s ? "border-danger bg-danger/10 text-danger" : "border-border text-ink hover:bg-background"}`}>{s}</button>)}</div>
    <Input label="Motivo do cancelamento" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} required />
    {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
    <Button type="submit" variante="perigo" disabled={enviando || motivo.trim().length < 3} className="sm:self-end">{enviando ? "Cancelando..." : "Cancelar esta conta"}</Button>
  </form>;
}

function AreaReabrir({ pedido, onAtualizado }: { pedido: Pedido; onAtualizado: () => void }) {
  const { erro, enviando, enviar } = useEnvio(onAtualizado);
  const conta = pedido.contaReceber!;
  return <div className="mt-5 flex flex-col gap-3 rounded-xl border-2 border-border p-4 sm:flex-row sm:items-center sm:justify-between">
    <div><p className="font-semibold text-ink">Conta cancelada{conta.canceladoEm ? ` em ${formatarDataHora(conta.canceladoEm).slice(0, 10)}` : ""}</p>{conta.motivoCancelamento && <p className="text-sm text-muted">Motivo: {conta.motivoCancelamento}</p>}{erro && <p role="alert" className="text-sm text-danger">{erro}</p>}</div>
    <Button variante="secundaria" disabled={enviando} onClick={() => enviar(() => api(`/pedidos/${pedido.id}/conta-receber/reabrir`, { method: "PATCH" }), "Erro ao reabrir a conta.")}>{enviando ? "Reabrindo..." : `Reabrir (${formatarMoeda(conta.saldo)} em aberto)`}</Button>
  </div>;
}
