import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { dataLocalISO } from "../../lib/formatadores";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { IconeAtualizar, IconeDownload } from "../../components/ui/Icones";
import {
  BarraComposicao,
  BarrasHorizontais,
  COR_ENTRADA,
  COR_SAIDA,
  CORES_CATEGORIAS,
  GraficoColunas,
  GraficoLinhas,
  GraficoRosca,
  Legenda,
} from "../../components/graficos/Graficos";
import type { Relatorio } from "./tipos";
import { dataBR, diaDaSemana, diaMes, kg, moeda, numero, pct, pontosDaSerie, textoVariacao } from "./util";

// ───────────────────────── Período ─────────────────────────

type Atalho = "hoje" | "7dias" | "mes" | "mesPassado" | "30dias" | "ano";
const ATALHOS: { id: Atalho; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7dias", rotulo: "7 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "mesPassado", rotulo: "Mês passado" },
  { id: "30dias", rotulo: "30 dias" },
  { id: "ano", rotulo: "Este ano" },
];

function periodoDoAtalho(atalho: Atalho) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const voltar = (dias: number) => new Date(ano, mes, hoje.getDate() - dias);
  switch (atalho) {
    case "hoje":
      return { inicio: dataLocalISO(hoje), fim: dataLocalISO(hoje) };
    case "7dias":
      return { inicio: dataLocalISO(voltar(6)), fim: dataLocalISO(hoje) };
    case "30dias":
      return { inicio: dataLocalISO(voltar(29)), fim: dataLocalISO(hoje) };
    case "mes":
      return { inicio: dataLocalISO(new Date(ano, mes, 1)), fim: dataLocalISO(hoje) };
    case "mesPassado":
      return { inicio: dataLocalISO(new Date(ano, mes - 1, 1)), fim: dataLocalISO(new Date(ano, mes, 0)) };
    case "ano":
      return { inicio: dataLocalISO(new Date(ano, 0, 1)), fim: dataLocalISO(hoje) };
  }
}

// ───────────────────────── Abas ─────────────────────────

const ABAS = [
  { id: "geral", rotulo: "Visão geral" },
  { id: "vendas", rotulo: "Vendas" },
  { id: "carnes", rotulo: "Carnes" },
  { id: "funcionarios", rotulo: "Funcionários" },
  { id: "gastos", rotulo: "Gastos e contas" },
  { id: "clientes", rotulo: "Clientes" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export function Relatorios() {
  const inicial = periodoDoAtalho("mes");
  const [inicio, setInicio] = useState(inicial.inicio);
  const [fim, setFim] = useState(inicial.fim);
  const [atalho, setAtalho] = useState<Atalho | null>("mes");
  const [aba, setAba] = useState<Aba>("geral");
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar(i = inicio, f = fim) {
    if (!i || !f) return setErro("Escolha a data de início e a data de fim.");
    if (i > f) return setErro("A data de início precisa ser antes da data de fim.");
    setErro("");
    setCarregando(true);
    try {
      setDados(await api<Relatorio>(`/relatorios/completo?inicio=${i}&fim=${f}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar o relatório.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function escolherAtalho(id: Atalho) {
    const p = periodoDoAtalho(id);
    setAtalho(id);
    setInicio(p.inicio);
    setFim(p.fim);
    carregar(p.inicio, p.fim);
  }

  async function baixarPdf() {
    if (!dados) return;
    setGerandoPdf(true);
    try {
      const { gerarPdfRelatorio } = await import("./relatorioPdf");
      await gerarPdfRelatorio(dados);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível gerar o PDF. Tente de novo.");
    } finally {
      setGerandoPdf(false);
    }
  }

  const periodoDesatualizado = dados && (dados.periodo.inicio !== inicio || dados.periodo.fim !== fim);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Período */}
      <Card className="flex flex-col gap-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {ATALHOS.map((a) => (
            <button
              key={a.id}
              onClick={() => escolherAtalho(a.id)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                atalho === a.id ? "border-primary bg-primary text-white" : "border-border bg-white text-ink hover:bg-background"
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:flex md:items-end">
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-ink">
            Data de início
            <input
              type="date"
              value={inicio}
              max={fim || undefined}
              onChange={(e) => {
                setInicio(e.target.value);
                setAtalho(null);
              }}
              className="h-11 min-w-0 rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-ink">
            Data de fim
            <input
              type="date"
              value={fim}
              min={inicio || undefined}
              onChange={(e) => {
                setFim(e.target.value);
                setAtalho(null);
              }}
              className="h-11 min-w-0 rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <Button variante="secundaria" onClick={() => carregar()} disabled={carregando} className="whitespace-nowrap">
            <IconeAtualizar tamanho={18} className={carregando ? "animate-spin" : ""} />
            {carregando ? "Carregando..." : "Ver relatório"}
          </Button>
          <Button onClick={baixarPdf} disabled={!dados || carregando || gerandoPdf || !!periodoDesatualizado} className="whitespace-nowrap">
            <IconeDownload tamanho={18} />
            {gerandoPdf ? "Gerando PDF..." : "Baixar PDF"}
          </Button>
        </div>
        {periodoDesatualizado && !carregando && (
          <p className="rounded-lg bg-gold/15 px-3 py-2 text-sm text-ink">Você mudou as datas. Toque em “Ver relatório” para atualizar antes de baixar o PDF.</p>
        )}
        {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      </Card>

      {!dados && carregando && <Esqueleto />}

      {dados && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
            <h2 className="font-display text-xl tracking-wide text-ink">
              {dataBR(dados.periodo.inicio)} {dados.periodo.inicio !== dados.periodo.fim && <>a {dataBR(dados.periodo.fim)}</>}
            </h2>
            <p className="text-xs text-muted">
              {dados.periodo.dias} {dados.periodo.dias === 1 ? "dia" : "dias"} · comparado com {dataBR(dados.periodo.anterior.inicio)} a {dataBR(dados.periodo.anterior.fim)}
            </p>
          </div>

          <nav className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-xl bg-background/95 px-1 py-1 backdrop-blur [scrollbar-width:none]" aria-label="Seções do relatório">
            {ABAS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                aria-current={aba === a.id}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                  aba === a.id ? "bg-ink text-white" : "text-muted hover:bg-black/5 hover:text-ink"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </nav>

          <div className={`flex min-w-0 flex-col gap-4 transition-opacity ${carregando ? "opacity-50" : ""}`}>
            {aba === "geral" && <VisaoGeral d={dados} />}
            {aba === "vendas" && <Vendas d={dados} />}
            {aba === "carnes" && <Carnes d={dados} />}
            {aba === "funcionarios" && <Funcionarios d={dados} />}
            {aba === "gastos" && <GastosEContas d={dados} />}
            {aba === "clientes" && <Clientes d={dados} />}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Peças visuais ─────────────────────────

type Tom = "neutro" | "bom" | "ruim" | "alerta";
const COR_TOM: Record<Tom, string> = { neutro: "text-ink", bom: "text-success", ruim: "text-danger", alerta: "text-gold-texto" };

function Kpi({
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
  variacao,
  menorEhMelhor = false,
  grande = false,
}: {
  rotulo: string;
  valor: string;
  detalhe?: React.ReactNode;
  tom?: Tom;
  variacao?: number | null;
  menorEhMelhor?: boolean;
  grande?: boolean;
}) {
  const temVariacao = variacao !== undefined;
  const melhorou = variacao != null && (menorEhMelhor ? variacao < 0 : variacao > 0);
  const piorou = variacao != null && (menorEhMelhor ? variacao > 0 : variacao < 0);
  return (
    <div className="flex min-w-0 flex-col rounded-card border border-border bg-surface p-3.5 shadow-card sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{rotulo}</p>
      <p className={`mt-1.5 truncate font-display tracking-wide ${grande ? "text-lg min-[400px]:text-xl sm:text-3xl" : "text-lg min-[400px]:text-xl sm:text-2xl"} ${COR_TOM[tom]}`} title={valor}>
        {valor}
      </p>
      {(detalhe || temVariacao) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {temVariacao && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
                variacao == null ? "bg-black/5 text-muted" : melhorou ? "bg-success/10 text-success" : piorou ? "bg-danger/10 text-danger" : "bg-black/5 text-muted"
              }`}
              title="Comparado com o período anterior de mesmo tamanho"
            >
              {variacao != null && variacao !== 0 && <span aria-hidden>{variacao > 0 ? "▲" : "▼"}</span>}
              {textoVariacao(variacao)}
            </span>
          )}
          {detalhe && <span className="min-w-0">{detalhe}</span>}
        </div>
      )}
    </div>
  );
}

function Grade({ children, colunas = 4 }: { children: React.ReactNode; colunas?: 2 | 3 | 4 }) {
  const cls = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4" }[colunas];
  return <div className={`grid grid-cols-2 gap-3 ${cls}`}>{children}</div>;
}

function Painel({ titulo, subtitulo, children, acao, className = "" }: { titulo: string; subtitulo?: string; children: React.ReactNode; acao?: React.ReactNode; className?: string }) {
  return (
    <Card className={`flex min-w-0 flex-col gap-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-muted">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </Card>
  );
}

function Tabela({ colunas, linhas, vazio = "Nada no período.", limite = 12 }: { colunas: { titulo: string; direita?: boolean }[]; linhas: React.ReactNode[][]; vazio?: string; limite?: number }) {
  const [tudo, setTudo] = useState(false);
  if (linhas.length === 0) return <p className="py-4 text-center text-sm text-muted">{vazio}</p>;
  const visiveis = tudo ? linhas : linhas.slice(0, limite);
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            {colunas.map((c) => (
              <th key={c.titulo} className={`whitespace-nowrap py-2 pr-3 font-medium ${c.direita ? "text-right" : ""}`}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {visiveis.map((linha, i) => (
            <tr key={i} className="hover:bg-background/60">
              {linha.map((celula, j) => (
                <td key={j} className={`py-2 pr-3 ${colunas[j]?.direita ? "whitespace-nowrap text-right" : ""} ${j === 0 ? "text-ink" : "text-ink/90"}`}>
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {linhas.length > limite && (
        <button onClick={() => setTudo(!tudo)} className="mt-2 w-full rounded-lg py-2 text-sm font-semibold text-primary hover:bg-primary/5">
          {tudo ? "Mostrar menos" : `Ver todos (${linhas.length})`}
        </button>
      )}
    </div>
  );
}

function Destaque({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg bg-background px-3 py-2.5">
      <span className="text-xs text-muted">{rotulo}</span>
      <span className="truncate font-semibold text-ink">{valor}</span>
      {detalhe && <span className="truncate text-xs text-muted">{detalhe}</span>}
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-24 rounded-card bg-black/5" />
      ))}
      <div className="col-span-full h-72 rounded-card bg-black/5" />
    </div>
  );
}

// ───────────────────────── Seções ─────────────────────────

function VisaoGeral({ d }: { d: Relatorio }) {
  const r = d.resumo;
  const { pontos, agrupamento } = useMemo(() => pontosDaSerie(d.porDia), [d.porDia]);
  const temDomingo = d.entradasPorSemana[0].total > 0;
  return (
    <>
      <Grade>
        <Kpi grande rotulo="Entradas" valor={moeda(r.entradas)} tom="bom" variacao={r.variacao.entradas} detalhe="vs. período anterior" />
        <Kpi grande rotulo="Saídas" valor={moeda(r.saidas)} tom="ruim" variacao={r.variacao.saidas} menorEhMelhor detalhe="contas pagas + sangrias" />
        <Kpi
          grande
          rotulo="Resultado do caixa"
          valor={moeda(r.resultado)}
          tom={r.resultado >= 0 ? "bom" : "ruim"}
          variacao={r.variacao.resultado}
          detalhe={r.margem != null ? `sobra de ${pct(r.margem)} das entradas` : undefined}
        />
        <Kpi grande rotulo="Média por dia" valor={moeda(r.mediaDiaria)} detalhe={`${r.diasComMovimento} ${r.diasComMovimento === 1 ? "dia" : "dias"} com movimento`} />
      </Grade>

      <Painel
        titulo="Entradas × saídas"
        subtitulo={agrupamento === "semana" ? "Somadas por semana" : "Dia a dia"}
        acao={<Legenda itens={[{ rotulo: "Entradas", cor: COR_ENTRADA }, { rotulo: "Saídas", cor: COR_SAIDA }]} />}
      >
        <GraficoLinhas
          rotulos={pontos.map((p) => p.rotulo)}
          rotulosLongos={pontos.map((p) => p.rotuloLongo)}
          series={[
            { nome: "Entradas", cor: COR_ENTRADA, valores: pontos.map((p) => p.entradas) },
            { nome: "Saídas", cor: COR_SAIDA, valores: pontos.map((p) => p.saidas) },
          ]}
          formatar={moeda}
        />
      </Painel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Painel titulo="De onde veio o dinheiro" subtitulo="Composição das entradas">
          <BarraComposicao
            formatar={moeda}
            itens={[
              { rotulo: "Caixa da loja", valor: r.composicao.caixaLoja, cor: CORES_CATEGORIAS[0] },
              { rotulo: "CEASA", valor: r.composicao.ceasa, cor: CORES_CATEGORIAS[1] },
              { rotulo: "Comandas entregues", valor: r.composicao.comandasEntregues, cor: CORES_CATEGORIAS[2] },
            ]}
          />
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Para onde foi</p>
            <BarraComposicao
              formatar={moeda}
              itens={[
                { rotulo: "Contas pagas", valor: r.saidasComposicao.contasPagas, cor: CORES_CATEGORIAS[4] },
                { rotulo: "Sangrias do caixa", valor: r.saidasComposicao.sangrias, cor: CORES_CATEGORIAS[5] },
              ]}
            />
          </div>
        </Painel>
        <Painel titulo="Média de entradas por dia da semana" subtitulo="Considera só os dias com movimento">
          <GraficoColunas
            formatar={moeda}
            itens={d.entradasPorSemana.filter((s, i) => i !== 0 || temDomingo).map((s) => ({ rotulo: s.rotulo, valor: s.media, detalhe: `Total ${moeda(s.total)}` }))}
          />
        </Painel>
      </div>

      <Painel titulo="Destaques do período">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Destaque
            rotulo="Melhor dia"
            valor={r.melhorDia ? moeda(r.melhorDia.entradas) : "—"}
            detalhe={r.melhorDia ? `${diaDaSemana(r.melhorDia.data)}, ${dataBR(r.melhorDia.data)}` : undefined}
          />
          <Destaque
            rotulo="Dia mais fraco"
            valor={r.piorDia ? moeda(r.piorDia.entradas) : "—"}
            detalhe={r.piorDia ? `${diaDaSemana(r.piorDia.data)}, ${dataBR(r.piorDia.data)}` : undefined}
          />
          <Destaque
            rotulo="Corte que mais vendeu"
            valor={d.carnes.produtos[0]?.nome ?? "—"}
            detalhe={d.carnes.produtos[0] ? `${moeda(d.carnes.produtos[0].faturamento)} · ${kg(d.carnes.produtos[0].kg)}` : undefined}
          />
          <Destaque
            rotulo="Horário de mais comandas"
            valor={d.vendas.horaPico ? `${d.vendas.horaPico.hora}h às ${d.vendas.horaPico.hora + 1}h` : "—"}
            detalhe={d.vendas.horaPico ? `${d.vendas.horaPico.quantidade} comandas` : undefined}
          />
        </div>
      </Painel>
      <p className="px-1 text-xs text-muted">
        Entradas = caixa da loja (dinheiro, Pix e cartões) + CEASA + comandas do sistema entregues. Saídas = contas a pagar pagas no período + sangrias. O resultado não desconta o custo de compra das carnes que ainda não virou conta paga.
      </p>
    </>
  );
}

function Vendas({ d }: { d: Relatorio }) {
  const v = d.vendas;
  return (
    <>
      <Grade>
        <Kpi rotulo="Comandas" valor={numero(v.numeroComandas)} variacao={d.resumo.variacao.numeroComandas} detalhe={v.canceladas ? `${v.canceladas} cancelada(s)` : "nenhuma cancelada"} />
        <Kpi rotulo="Vendido em comandas" valor={moeda(v.totalComandas)} tom="bom" variacao={d.resumo.variacao.vendasComandas} />
        <Kpi rotulo="Ticket médio" valor={moeda(v.ticketMedio)} detalhe="valor médio por comanda" />
        <Kpi rotulo="Recebido no sistema" valor={moeda(v.recebidoNoSistema)} detalhe="pagamentos registrados" />
        <Kpi rotulo="Delivery" valor={numero(v.delivery.quantidade)} detalhe={moeda(v.delivery.total)} />
        <Kpi rotulo="Retirada no balcão" valor={numero(v.retirada.quantidade)} detalhe={moeda(v.retirada.total)} />
        <Kpi rotulo="Pedidos pelo site" valor={numero(v.site.quantidade)} detalhe={moeda(v.site.total)} />
        <Kpi rotulo="Encomendas" valor={numero(v.encomendas.quantidade)} detalhe={`para outro dia · ${moeda(v.encomendas.total)}`} />
        <Kpi rotulo="Vendas a prazo" valor={moeda(v.vendasAPrazo.total)} tom="alerta" detalhe={`${v.vendasAPrazo.quantidade} comanda(s) fiado`} />
        <Kpi rotulo="Descontos dados" valor={moeda(v.descontos)} detalhe="nas comandas" />
        <Kpi rotulo="Taxas de entrega" valor={moeda(v.taxasEntrega)} />
        <Kpi rotulo="Caixa da loja" valor={moeda(d.resumo.composicao.caixaLoja)} detalhe={`+ CEASA ${moeda(d.resumo.composicao.ceasa)}`} />
      </Grade>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Painel titulo="Formas de pagamento" subtitulo="Recebido nas comandas do sistema">
          <GraficoRosca formatar={moeda} itens={v.formasPagamento.map((f) => ({ rotulo: f.rotulo, valor: f.total }))} />
        </Painel>
        <Painel titulo="Comandas por horário" subtitulo="Quantidade de comandas anotadas em cada hora">
          <GraficoColunas
            formatar={(n) => `${numero(n)} comanda(s)`}
            formatarEixo={(n) => numero(Math.round(n))}
            itens={v.porHora.map((h) => ({ rotulo: `${h.hora}h`, valor: h.quantidade, detalhe: moeda(h.total) }))}
          />
        </Painel>
      </div>
      <Painel titulo="Retirada × delivery">
        <BarraComposicao
          formatar={moeda}
          itens={[
            { rotulo: `Retirada (${v.retirada.quantidade})`, valor: v.retirada.total, cor: CORES_CATEGORIAS[0] },
            { rotulo: `Delivery (${v.delivery.quantidade})`, valor: v.delivery.total, cor: CORES_CATEGORIAS[1] },
          ]}
        />
      </Painel>
    </>
  );
}

function Carnes({ d }: { d: Relatorio }) {
  const c = d.carnes;
  const [ordem, setOrdem] = useState<"faturamento" | "kg">("faturamento");
  const top = [...c.produtos].sort((a, b) => (ordem === "kg" ? b.kg - a.kg : b.faturamento - a.faturamento)).slice(0, 10);
  return (
    <>
      <Grade>
        <Kpi rotulo="Carne vendida" valor={kg(c.kgVendidos)} detalhe="nas comandas" />
        <Kpi rotulo="Faturamento dos cortes" valor={moeda(c.faturamentoItens)} tom="bom" />
        <Kpi rotulo="Preço médio do kg" valor={moeda(c.precoMedioKg)} detalhe="itens vendidos por peso" />
        <Kpi rotulo="Cortes vendidos" valor={`${c.cortesDiferentes} de ${c.produtosAtivos}`} detalhe={`${c.semVenda.length} sem venda`} />
        <Kpi
          rotulo="Ajustes de preço"
          valor={moeda(c.ajustesPreco.total)}
          tom={c.ajustesPreco.total < 0 ? "ruim" : "neutro"}
          detalhe={`${c.ajustesPreco.itens} item(ns) vendidos fora do preço de tabela atual`}
        />
        <Kpi rotulo="Kg por comanda" valor={kg(d.vendas.numeroComandas ? c.kgVendidos / d.vendas.numeroComandas : 0)} />
      </Grade>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <Painel
          titulo="Cortes que mais venderam"
          subtitulo="Top 10"
          acao={
            <div className="flex rounded-lg bg-background p-0.5 text-xs font-semibold">
              {(["faturamento", "kg"] as const).map((o) => (
                <button key={o} onClick={() => setOrdem(o)} className={`rounded-md px-2.5 py-1 ${ordem === o ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
                  {o === "kg" ? "Por kg" : "Por R$"}
                </button>
              ))}
            </div>
          }
        >
          <BarrasHorizontais
            itens={top.map((p) =>
              ordem === "kg"
                ? { rotulo: p.nome, valor: p.kg, detalhe: moeda(p.faturamento) }
                : { rotulo: p.nome, valor: p.faturamento, detalhe: p.unidade === "kg" ? kg(p.kg) : `${numero(p.quantidade)} ${p.unidade}` }
            )}
            formatar={ordem === "kg" ? kg : moeda}
          />
        </Painel>
        <Painel titulo="Vendas por categoria">
          <GraficoRosca formatar={moeda} itens={c.porCategoria.map((p) => ({ rotulo: p.categoria, valor: p.total }))} />
        </Painel>
      </div>
      <Painel titulo="Todos os cortes vendidos" subtitulo={`${c.produtos.length} corte(s)`}>
        <Tabela
          colunas={[{ titulo: "Corte" }, { titulo: "Categoria" }, { titulo: "Quantidade", direita: true }, { titulo: "Vezes", direita: true }, { titulo: "Preço médio", direita: true }, { titulo: "Faturamento", direita: true }]}
          linhas={c.produtos.map((p) => [
            p.nome,
            <span className="text-muted">{p.categoria}</span>,
            p.unidade === "kg" ? kg(p.kg) : `${numero(p.quantidade)} ${p.unidade}`,
            numero(p.vezes),
            moeda(p.precoMedio),
            <strong>{moeda(p.faturamento)}</strong>,
          ])}
        />
      </Painel>
      {c.semVenda.length > 0 && (
        <Painel titulo="Cortes sem nenhuma venda no período" subtitulo="Bom para revisar estoque, preço ou divulgação">
          <div className="flex flex-wrap gap-1.5">
            {c.semVenda.map((n) => (
              <span key={n} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-ink">
                {n}
              </span>
            ))}
          </div>
        </Painel>
      )}
    </>
  );
}

function Funcionarios({ d }: { d: Relatorio }) {
  const f = d.funcionarios;
  const comCorte = f.equipe.filter((e) => e.kgCortado > 0);
  return (
    <>
      <Grade>
        <Kpi rotulo="Funcionários ativos" valor={numero(f.ativos)} detalhe={`${f.registrados} registrado(s) · ${f.naoRegistrados} sem registro`} />
        <Kpi rotulo="Folha semanal" valor={moeda(f.folhaSemanal)} detalhe="pago todo sábado" />
        <Kpi rotulo="Folha mensal estimada" valor={moeda(f.folhaMensalEstimada)} detalhe="média de 4,33 sábados" />
        <Kpi rotulo="Peso da folha" valor={pct(f.pesoNaReceita)} tom="alerta" detalhe="salários do período ÷ entradas" />
        <Kpi rotulo="Salários do período" valor={moeda(f.salariosPrevistos)} detalhe="sábados dentro das datas" />
        <Kpi rotulo="Salários pagos" valor={moeda(f.salariosPagos)} tom="bom" />
        <Kpi rotulo="Salários pendentes" valor={moeda(f.salariosPendentes)} tom={f.salariosPendentes > 0 ? "ruim" : "neutro"} />
        <Kpi rotulo="Kg cortados pela equipe" valor={kg(comCorte.reduce((s, e) => s + e.kgCortado, 0))} />
      </Grade>
      <Painel titulo="Salários por funcionário" subtitulo="Sábados que caem dentro do período escolhido">
        <Tabela
          colunas={[{ titulo: "Funcionário" }, { titulo: "Registro" }, { titulo: "Por sábado", direita: true }, { titulo: "Sábados", direita: true }, { titulo: "Pago", direita: true }, { titulo: "Pendente", direita: true }]}
          linhas={f.lista.map((x) => [
            <span>
              {x.nome}
              {x.funcao && <span className="block text-xs text-muted">{x.funcao}</span>}
              {!x.ativo && <span className="block text-xs text-muted">inativo</span>}
            </span>,
            x.registrado ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Registrado</span> : <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-muted">Sem registro</span>,
            moeda(x.salarioSemanal),
            numero(x.sabados),
            moeda(x.pago),
            <span className={x.pendente > 0 ? "font-semibold text-danger" : ""}>{moeda(x.pendente)}</span>,
          ])}
          vazio="Nenhum funcionário cadastrado."
        />
      </Painel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Painel titulo="Quem mais cortou carne" subtitulo="Kg pesados e marcados como cortados">
          <BarrasHorizontais itens={comCorte.sort((a, b) => b.kgCortado - a.kgCortado).map((e) => ({ rotulo: e.nome, valor: e.kgCortado, detalhe: `${e.itensCortados} itens` }))} formatar={kg} cor={CORES_CATEGORIAS[1]} />
        </Painel>
        <Painel titulo="Quem mais vendeu" subtitulo="Comandas anotadas por usuário do sistema">
          <BarrasHorizontais itens={f.equipe.filter((e) => e.comandas > 0).sort((a, b) => b.vendas - a.vendas).map((e) => ({ rotulo: e.nome, valor: e.vendas, detalhe: `${e.comandas} comandas` }))} formatar={moeda} />
        </Painel>
      </div>
    </>
  );
}

function ListaContas({ contas, vazio }: { contas: { fornecedor: string; descricao: string; vencimento: string; saldo: number }[]; vazio: string }) {
  if (contas.length === 0) return <p className="py-4 text-center text-sm text-muted">{vazio}</p>;
  return (
    <ul className="divide-y divide-border">
      {contas.map((c, i) => (
        <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate text-ink">{c.fornecedor}</span>
            <span className="block truncate text-xs text-muted">
              {dataBR(c.vencimento)} · {c.descricao}
            </span>
          </span>
          <strong className="shrink-0 whitespace-nowrap text-ink">{moeda(c.saldo)}</strong>
        </li>
      ))}
    </ul>
  );
}

function GastosEContas({ d }: { d: Relatorio }) {
  const g = d.gastos;
  const c = d.contas;
  return (
    <>
      <Grade>
        <Kpi rotulo="Total gasto" valor={moeda(g.totalPago)} tom="ruim" variacao={d.resumo.variacao.saidas} menorEhMelhor />
        <Kpi rotulo="Contas pagas" valor={moeda(g.contasPagas)} />
        <Kpi rotulo="Sangrias do caixa" valor={moeda(g.sangrias)} detalhe={`${g.sangriasDetalhe.length} dia(s)`} />
        <Kpi rotulo="Vencem no período" valor={moeda(c.vencemNoPeriodo.total)} detalhe={`${c.vencemNoPeriodo.quantidade} conta(s) · ${moeda(c.vencemNoPeriodo.aberto)} em aberto`} />
        <Kpi rotulo="Contas vencidas (hoje)" valor={moeda(c.vencidas.total)} tom={c.vencidas.quantidade ? "ruim" : "bom"} detalhe={`${c.vencidas.quantidade} conta(s)`} />
        <Kpi rotulo="Vencem nos próximos 7 dias" valor={moeda(c.proximos7dias.total)} tom="alerta" detalhe={`${c.proximos7dias.quantidade} conta(s)`} />
        <Kpi rotulo="Total em aberto (hoje)" valor={moeda(c.emAbertoHoje.total)} detalhe={`${c.emAbertoHoje.quantidade} conta(s)`} />
        <Kpi rotulo="Gasto médio por dia" valor={moeda(d.periodo.dias ? g.totalPago / d.periodo.dias : 0)} />
      </Grade>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Painel titulo="Gastos por categoria" subtitulo="Contas pagas + sangrias">
          <GraficoRosca formatar={moeda} itens={g.porCategoria.map((x) => ({ rotulo: x.categoria, valor: x.total }))} />
        </Painel>
        <Painel titulo="Fornecedores que mais receberam" subtitulo="Sem contar salários">
          <BarrasHorizontais itens={g.topFornecedores.map((x) => ({ rotulo: x.fornecedor, valor: x.total }))} formatar={moeda} cor={CORES_CATEGORIAS[4]} />
        </Painel>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Painel titulo="Contas vencidas" subtitulo="Situação de hoje, não pagas">
          <ListaContas contas={c.vencidas.lista} vazio="Nenhuma conta vencida. 👏" />
        </Painel>
        <Painel titulo="A vencer nos próximos 7 dias">
          <ListaContas contas={c.proximos7dias.lista} vazio="Nada vence nos próximos 7 dias." />
        </Painel>
      </div>
      {g.sangriasDetalhe.length > 0 && (
        <Painel titulo="Sangrias do caixa" subtitulo="Dinheiro tirado do caixa para gastos do dia">
          <Tabela
            colunas={[{ titulo: "Dia" }, { titulo: "Descrição" }, { titulo: "Valor", direita: true }]}
            linhas={g.sangriasDetalhe.map((s) => [`${diaMes(s.data)} (${diaDaSemana(s.data).slice(0, 3)})`, s.descricao || <span className="text-muted">—</span>, moeda(s.valor)])}
          />
        </Painel>
      )}
    </>
  );
}

function Clientes({ d }: { d: Relatorio }) {
  const cl = d.clientes;
  const ar = d.contas.aReceber;
  return (
    <>
      <Grade>
        <Kpi rotulo="Clientes que compraram" valor={numero(cl.compraram)} detalhe={`+ ${cl.consumidorFinal} comanda(s) sem cadastro`} />
        <Kpi rotulo="Clientes novos" valor={numero(cl.novos)} tom="bom" detalhe={`${cl.ativos} ativos no cadastro`} />
        <Kpi rotulo="A receber (fiado)" valor={moeda(ar.total)} tom="alerta" detalhe={`${ar.clientesDevendo} cliente(s) devendo`} />
        <Kpi rotulo="Fiado atrasado" valor={moeda(ar.vencido)} tom={ar.vencido > 0 ? "ruim" : "bom"} detalhe={`${ar.clientesAtrasados} cliente(s) em atraso`} />
      </Grade>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Painel titulo="Clientes que mais compraram" subtitulo="Top 10 no período">
          <BarrasHorizontais itens={cl.top.map((x) => ({ rotulo: x.nome, valor: x.total, detalhe: `${x.comandas} comanda(s)` }))} formatar={moeda} cor={CORES_CATEGORIAS[1]} />
        </Painel>
        <Painel titulo="Quem está devendo" subtitulo="Situação de hoje">
          <Tabela
            colunas={[{ titulo: "Cliente" }, { titulo: "Desde" }, { titulo: "Atrasado", direita: true }, { titulo: "Saldo", direita: true }]}
            linhas={ar.devedores.map((x) => [x.nome, dataBR(x.maisAntigo), <span className={x.vencido > 0 ? "font-semibold text-danger" : "text-muted"}>{moeda(x.vencido)}</span>, <strong>{moeda(x.saldo)}</strong>])}
            vazio="Ninguém devendo. 👏"
          />
        </Painel>
      </div>
    </>
  );
}
