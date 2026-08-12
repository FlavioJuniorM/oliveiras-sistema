import { FormEvent, useEffect, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { formatarData, formatarMoeda } from "../../lib/formatadores";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";

interface ContaPagar {
  id: string;
  fornecedor: string;
  descricao: string;
  categoria: string;
  valor: string | number;
  vencimento: string;
  status: string;
}

const CATEGORIAS = [
  "Fornecedores",
  "Energia",
  "Água",
  "Aluguel",
  "Funcionários",
  "Impostos",
  "Manutenção",
  "Outros",
];

export function ContasPagar() {
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  function carregar() {
    api<ContaPagar[]>("/contas-pagar").then(setContas);
  }

  useEffect(carregar, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <p className="text-muted text-sm">{contas.length} lançamento(s)</p>
        <Button onClick={() => setMostrarFormulario(true)}>Nova conta a pagar</Button>
      </div>

      {mostrarFormulario && (
        <FormularioContaPagar
          onCancelar={() => setMostrarFormulario(false)}
          onCriado={() => {
            setMostrarFormulario(false);
            carregar();
          }}
        />
      )}

      <Card padded={false}>
        <div className="divide-y divide-border">
          {contas.length === 0 && <p className="text-muted text-sm p-5">Nenhuma conta lançada.</p>}
          {contas.map((conta) => (
            <div key={conta.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-medium text-ink">{conta.fornecedor}</p>
                <p className="text-xs text-muted mt-0.5">
                  {conta.descricao} · {conta.categoria} · Venc. {formatarData(conta.vencimento)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-semibold text-ink">{formatarMoeda(conta.valor)}</p>
                <StatusBadge status={conta.status} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function FormularioContaPagar({ onCancelar, onCriado }: { onCancelar: () => void; onCriado: () => void }) {
  const [fornecedor, setFornecedor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await api("/contas-pagar", {
        method: "POST",
        body: {
          fornecedor,
          descricao,
          categoria,
          valor: Number(valor),
          dataLancamento: new Date().toISOString(),
          vencimento,
        },
      });
      onCriado();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Erro ao lançar conta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <form onSubmit={aoEnviar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} required />
        <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Categoria</label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Input label="Valor" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
        <Input label="Vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />

        {erro && <p className="text-sm text-danger sm:col-span-2">{erro}</p>}

        <div className="flex gap-2 sm:col-span-2">
          <Button type="button" variante="secundaria" onClick={onCancelar} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando} className="flex-1">
            {enviando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
