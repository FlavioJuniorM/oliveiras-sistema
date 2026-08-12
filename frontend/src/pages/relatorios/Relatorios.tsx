import { useState } from "react";
import { api } from "../../lib/api";
import { formatarMoeda } from "../../lib/formatadores";
import { Card, CardTitulo } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

function primeiroDiaDoMes() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
}
function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export function Relatorios() {
  const [inicio, setInicio] = useState(primeiroDiaDoMes());
  const [fim, setFim] = useState(hojeISO());
  const [vendas, setVendas] = useState<any>(null);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any>(null);
  const [financeiro, setFinanceiro] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);

  async function gerar() {
    setCarregando(true);
    const qs = `?inicio=${inicio}&fim=${fim}`;
    const [v, p, c, f] = await Promise.all([
      api<any>(`/relatorios/vendas${qs}`),
      api<any[]>(`/relatorios/produtos${qs}`),
      api<any>(`/relatorios/clientes${qs}`),
      api<any>(`/relatorios/financeiro${qs}`),
    ]);
    setVendas(v);
    setProdutos(p);
    setClientes(c);
    setFinanceiro(f);
    setCarregando(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <Input label="Início" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          <Input label="Fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          <Button onClick={gerar} disabled={carregando}>
            {carregando ? "Gerando..." : "Gerar relatório"}
          </Button>
        </div>
      </Card>

      {vendas && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardTitulo>Vendas no período</CardTitulo>
            <p className="font-display text-3xl text-gold mt-2 tracking-wide">
              {formatarMoeda(vendas.totalPeriodo)}
            </p>
            <p className="text-muted text-sm mt-1">{vendas.numeroPedidos} pedido(s)</p>
          </Card>

          {financeiro && (
            <Card>
              <CardTitulo>Financeiro</CardTitulo>
              <div className="mt-2 flex flex-col gap-1 text-sm">
                <Linha rotulo="Recebido" valor={financeiro.totalRecebido} />
                <Linha rotulo="A receber" valor={financeiro.totalAReceber} />
                <Linha rotulo="Vencido" valor={financeiro.totalVencido} />
                <Linha rotulo="Contas a pagar (lançadas)" valor={financeiro.totalContasPagar} />
                <Linha rotulo="Fluxo de caixa do período" valor={financeiro.fluxoCaixaPeriodo} />
              </div>
            </Card>
          )}

          <Card>
            <CardTitulo>Produtos mais vendidos</CardTitulo>
            <div className="mt-2 flex flex-col divide-y divide-border">
              {produtos.slice(0, 8).map((p) => (
                <div key={p.produtoId} className="flex justify-between py-2 text-sm">
                  <span className="text-ink">{p.nome}</span>
                  <span className="text-muted">{formatarMoeda(p.faturamento)}</span>
                </div>
              ))}
              {produtos.length === 0 && <p className="text-muted text-sm py-2">Sem vendas no período.</p>}
            </div>
          </Card>

          {clientes && (
            <Card>
              <CardTitulo>Clientes que mais compram</CardTitulo>
              <div className="mt-2 flex flex-col divide-y divide-border">
                {clientes.clientesQueMaisCompram.slice(0, 8).map((c: any) => (
                  <div key={c.clienteId} className="flex justify-between py-2 text-sm">
                    <span className="text-ink">{c.nome}</span>
                    <span className="text-muted">{formatarMoeda(c.totalComprado)}</span>
                  </div>
                ))}
                {clientes.clientesQueMaisCompram.length === 0 && (
                  <p className="text-muted text-sm py-2">Sem dados no período.</p>
                )}
              </div>
              {clientes.clientesInadimplentes.length > 0 && (
                <>
                  <CardTitulo className="mt-4">Clientes inadimplentes</CardTitulo>
                  <div className="mt-2 flex flex-col divide-y divide-border">
                    {clientes.clientesInadimplentes.map((c: any, i: number) => (
                      <div key={i} className="flex justify-between py-2 text-sm">
                        <span className="text-ink">{c.nome}</span>
                        <span className="text-danger">{formatarMoeda(c.saldo)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{rotulo}</span>
      <span className="font-medium text-ink">{formatarMoeda(valor)}</span>
    </div>
  );
}
