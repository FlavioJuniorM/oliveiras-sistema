import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatarData, formatarMoeda } from "../lib/formatadores";
import { DashboardData } from "../types";
import { Card, CardSubtitulo, CardTitulo } from "../components/ui/Card";
import { KpiCard } from "../components/ui/KpiCard";
import { StatusBadge } from "../components/ui/StatusBadge";

export function Dashboard() {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api<DashboardData>("/dashboard")
      .then(setDados)
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return <p className="text-muted">Carregando painel...</p>;
  }

  if (!dados) {
    return <p className="text-muted">Não foi possível carregar o painel agora.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
        <KpiCard rotulo="Vendas hoje" valor={formatarMoeda(dados.vendasHoje)} destaque />
        <KpiCard rotulo="Recebido hoje" valor={formatarMoeda(dados.recebidoHoje)} tom="sucesso" />
        <KpiCard rotulo="A receber" valor={formatarMoeda(dados.totalAReceber)} tom="alerta" />
        <KpiCard rotulo="Vencido" valor={formatarMoeda(dados.totalVencido)} tom="perigo" />
        <KpiCard rotulo="Pedidos hoje" valor={String(dados.numeroPedidosHoje)} />
        <KpiCard rotulo="Em preparo" valor={String(dados.pedidosEmPreparo)} tom="alerta" />
        <KpiCard rotulo="Em rota" valor={String(dados.pedidosEmEntrega)} tom="sucesso" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardTitulo>Vendas do mês</CardTitulo>
          <p className="font-display text-3xl text-gold mt-2 tracking-wide">
            {formatarMoeda(dados.vendasMes)}
          </p>
          <CardSubtitulo className="mt-1">
            {dados.clientesAtendidosHoje} cliente(s) atendido(s) hoje
          </CardSubtitulo>
        </Card>

        <Card className="lg:col-span-2"><CardTitulo>Mais vendidas no mês</CardTitulo><ListaRanking itens={dados.produtosMaisVendidos} tipo="produto" /></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardTitulo>Menos vendidas no mês</CardTitulo><ListaRanking itens={dados.produtosMenosVendidos} tipo="produto" vazio="Nenhum produto cadastrado." /></Card>
        <Card><CardTitulo>Clientes que mais compraram</CardTitulo><ListaRanking itens={dados.clientesMaisCompraram} tipo="cliente" /></Card>
        <Card><CardTitulo>Clientes que menos compraram</CardTitulo><ListaRanking itens={dados.clientesMenosCompraram} tipo="cliente" vazio="Nenhum cliente cadastrado." /></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardTitulo>Contas a receber — vencidas e próximas do vencimento</CardTitulo>
          <div className="mt-3 flex flex-col divide-y divide-border">
            {[...dados.contasReceberVencidas, ...dados.contasReceberProximasVencimento].length === 0 && (
              <p className="text-muted text-sm py-3">Nenhuma conta a receber pendente no momento.</p>
            )}
            {dados.contasReceberVencidas.map((conta) => (
              <LinhaConta
                key={conta.id}
                nome={conta.cliente?.nome ?? "Cliente"}
                valor={conta.saldo}
                vencimento={conta.vencimento}
                status="VENCIDO"
              />
            ))}
            {dados.contasReceberProximasVencimento.map((conta) => (
              <LinhaConta
                key={conta.id}
                nome={conta.cliente?.nome ?? "Cliente"}
                valor={conta.saldo}
                vencimento={conta.vencimento}
                status="PENDENTE"
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardTitulo>Contas a pagar — próximas do vencimento</CardTitulo>
          <div className="mt-3 flex flex-col divide-y divide-border">
            {dados.contasPagarProximasVencimento.length === 0 && (
              <p className="text-muted text-sm py-3">Nenhuma conta a pagar nos próximos 7 dias.</p>
            )}
            {dados.contasPagarProximasVencimento.map((conta) => (
              <LinhaConta
                key={conta.id}
                nome={conta.fornecedor}
                valor={conta.valor}
                vencimento={conta.vencimento}
                status="PENDENTE"
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ListaRanking({ itens, tipo, vazio = "Nenhuma venda registrada neste mês ainda." }: { itens: { nome: string; quantidade?: number; faturamento?: number; pedidos?: number; valorComprado?: number }[]; tipo: "produto" | "cliente"; vazio?: string }) {
  if (itens.length === 0) return <p className="text-muted text-sm py-3">{vazio}</p>;
  return <div className="mt-3 flex flex-col divide-y divide-border">{itens.map((item, indice) => <div key={`${item.nome}-${indice}`} className="flex items-center justify-between gap-3 py-2.5"><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-background text-xs font-bold text-primary">{indice + 1}</span><div><p className="text-sm font-medium text-ink">{item.nome}</p><p className="text-xs text-muted">{tipo === "produto" ? `${Number(item.quantidade || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg vendidos` : `${item.pedidos || 0} pedido(s)`}</p></div></div><p className="text-sm font-semibold text-ink">{formatarMoeda(tipo === "produto" ? item.faturamento || 0 : item.valorComprado || 0)}</p></div>)}</div>;
}

function LinhaConta({
  nome,
  valor,
  vencimento,
  status,
}: {
  nome: string;
  valor: string | number;
  vencimento: string;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-sm font-medium text-ink">{nome}</p>
        <p className="text-xs text-muted">Vencimento: {formatarData(vencimento)}</p>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-ink">{formatarMoeda(valor)}</p>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
