import { useCallback, useEffect, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { dataLocalISO, formatarDataCalendario, formatarMoeda } from "../../lib/formatadores";
import { abrirJanelaImpressao } from "../../lib/impressao";
import { Card, CardTitulo } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

interface Caixa {
  data: string;
  totalRecebido: number;
  totalCartoes: number;
  porForma: { forma: string; quantidade: number; total: number }[];
  recebimentos: { id: string; criadoEm: string; forma: string; valor: number; pedido: string; cliente: string; recebidoPor: string }[];
  vendasAPrazo: { quantidade: number; total: number; itens: { pedido: string; cliente: string; valor: number; vencimento: string }[] };
  comandasCanceladas: number;
}

const NOMES_FORMA: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO_DEBITO: "Cartão de débito",
  CARTAO_CREDITO: "Cartão de crédito",
  TRANSFERENCIA: "Transferência",
  BOLETO: "Boleto",
  OUTROS: "Outros",
};

const ICONES_FORMA: Record<string, string> = { DINHEIRO: "💵", PIX: "⚡", CARTAO_DEBITO: "💳", CARTAO_CREDITO: "💳" };

function hora(instante: string) {
  return new Date(instante).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!);
}

/** Resumo do caixa para a impressora térmica de 58 mm. */
function htmlFechamento(caixa: Caixa) {
  const linhas = caixa.porForma
    .map((linha) => `<div class="l"><span>${escapar(NOMES_FORMA[linha.forma] || linha.forma)} (${linha.quantidade})</span><span>${formatarMoeda(linha.total)}</span></div>`)
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Caixa ${caixa.data}</title><style>
@page{size:58mm auto;margin:0}*{box-sizing:border-box}body{margin:0;width:58mm;font-family:"Courier New",monospace;font-size:11px;color:#000}
.n{width:54mm;margin:0 auto;padding:3mm 0 8mm}.c{text-align:center}.t{font-weight:700;font-size:13px}.l{display:flex;justify-content:space-between;line-height:1.5}
.s{border-top:1px dashed #000;margin:6px 0}.g{font-size:15px;font-weight:700}</style></head>
<body onload="setTimeout(function(){window.print()},300)"><main class="n">
<div class="c t">CASA DE CARNES OLIVEIRAS</div><div class="c t">FECHAMENTO DE CAIXA</div><div class="c">${formatarDataCalendario(caixa.data)}</div>
<div class="s"></div>${linhas}<div class="s"></div>
<div class="l"><span>Total cartões</span><span>${formatarMoeda(caixa.totalCartoes)}</span></div>
<div class="l g"><span>TOTAL RECEBIDO</span><span>${formatarMoeda(caixa.totalRecebido)}</span></div>
<div class="s"></div><div class="l"><span>Vendas a prazo (${caixa.vendasAPrazo.quantidade})</span><span>${formatarMoeda(caixa.vendasAPrazo.total)}</span></div>
<div class="l"><span>Comandas canceladas</span><span>${caixa.comandasCanceladas}</span></div>
<div class="s"></div><div class="c">Impresso em ${escapar(new Date().toLocaleString("pt-BR"))}</div><br><div>Conferido: ____________________</div>
</main></body></html>`;
}

export function FechamentoCaixa() {
  const [data, setData] = useState(dataLocalISO());
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async (dia: string) => {
    setCarregando(true);
    setErro("");
    try {
      setCaixa(await api<Caixa>(`/relatorios/caixa?data=${dia}`));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar o caixa.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(data);
  }, [carregar, data]);

  function imprimir() {
    if (!caixa) return;
    const janela = abrirJanelaImpressao();
    if (!janela) return setErro("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
    const url = URL.createObjectURL(new Blob([htmlFechamento(caixa)], { type: "text/html;charset=utf-8" }));
    janela.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-muted">Tudo o que foi recebido no dia, por forma de pagamento</p></div>
        <div className="flex items-end gap-2"><Input label="Dia" type="date" value={data} max={dataLocalISO()} onChange={(e) => e.target.value && setData(e.target.value)} /><Button variante="secundaria" disabled={!caixa} onClick={imprimir}>🖨 Imprimir</Button></div>
      </div>
      {erro && <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}
      {carregando && !caixa && <Card><p className="text-sm text-muted">Carregando...</p></Card>}
      {caixa && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {caixa.porForma.map((linha) => <Card key={linha.forma}><p className="text-sm text-muted">{ICONES_FORMA[linha.forma] || "•"} {NOMES_FORMA[linha.forma] || linha.forma}</p><p className="mt-1 font-display text-3xl text-ink">{formatarMoeda(linha.total)}</p><p className="mt-1 text-xs text-muted">{linha.quantidade} {linha.quantidade === 1 ? "recebimento" : "recebimentos"}</p></Card>)}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="border-2 border-success/30"><p className="text-sm text-muted">Total recebido no dia</p><p className="mt-1 font-display text-4xl text-success">{formatarMoeda(caixa.totalRecebido)}</p></Card>
          <Card><p className="text-sm text-muted">Total nas maquininhas (débito + crédito)</p><p className="mt-1 font-display text-3xl text-ink">{formatarMoeda(caixa.totalCartoes)}</p><p className="mt-1 text-xs text-muted">Compare com o relatório da maquininha</p></Card>
          <Card><p className="text-sm text-muted">Vendido a prazo (não entra no caixa)</p><p className="mt-1 font-display text-3xl text-gold-texto">{formatarMoeda(caixa.vendasAPrazo.total)}</p><p className="mt-1 text-xs text-muted">{caixa.vendasAPrazo.quantidade} comanda(s){caixa.comandasCanceladas > 0 ? ` · ${caixa.comandasCanceladas} cancelada(s) no dia` : ""}</p></Card>
        </div>
        <Card padded={false}>
          <div className="px-5 pt-5"><CardTitulo>Recebimentos do dia</CardTitulo></div>
          {caixa.recebimentos.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Nenhum recebimento neste dia.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y border-border bg-background text-left text-xs uppercase tracking-wide text-muted"><th className="px-5 py-2">Hora</th><th className="px-3 py-2">Comanda</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Forma</th><th className="px-3 py-2">Recebido por</th><th className="px-5 py-2 text-right">Valor</th></tr></thead><tbody className="divide-y divide-border">{caixa.recebimentos.map((r) => <tr key={r.id}><td className="px-5 py-2.5 text-muted">{hora(r.criadoEm)}</td><td className="px-3 py-2.5 font-semibold text-ink">{r.pedido}</td><td className="px-3 py-2.5 text-ink">{r.cliente}</td><td className="px-3 py-2.5 text-ink">{NOMES_FORMA[r.forma] || r.forma}</td><td className="px-3 py-2.5 text-muted">{r.recebidoPor}</td><td className="px-5 py-2.5 text-right font-semibold text-ink">{formatarMoeda(r.valor)}</td></tr>)}</tbody></table></div>}
        </Card>
      </>}
    </div>
  );
}
