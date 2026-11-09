import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { dataLocalISO, formatarDataCalendario, formatarMoeda } from "../../lib/formatadores";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { IconeLapis, IconeLixeira, IconeMais } from "../../components/ui/Icones";
import { normalizar } from "../../components/fornecedores/fornecedores";

interface Funcionario {
  id: string;
  nome: string;
  funcao: string | null;
  telefone: string | null;
  endereco: string | null;
  cpf: string | null;
  rg: string | null;
  dataNascimento: string | null;
  dataAdmissao: string | null;
  registrado: boolean;
  salario: number;
  chavePix: string | null;
  observacoes: string | null;
  status: "ATIVO" | "INATIVO";
  inicioPagamentos: string;
  proximoPagamento: { id: string; data: string; valor: number } | null;
  ultimoPagamento: { data: string; valor: number } | null;
  atrasados: number;
  valorAtrasado: number;
}

/** Próximo sábado (ou hoje, se for sábado), no formato AAAA-MM-DD. */
function proximoSabado() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return dataLocalISO(d);
}

function ehSabado(dia: string) {
  return new Date(`${dia}T12:00:00Z`).getUTCDay() === 6;
}

function linkWhatsApp(telefone: string) {
  const n = telefone.replace(/\D/g, "");
  if (n.length < 10) return null;
  return `https://wa.me/${n.startsWith("55") ? n : `55${n}`}`;
}

export function Funcionarios() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [edicao, setEdicao] = useState<{ funcionario?: Funcionario } | null>(null);
  const [exclusao, setExclusao] = useState<Funcionario | null>(null);
  const [aviso, setAviso] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      setFuncionarios(await api<Funcionario[]>("/funcionarios"));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar os funcionários.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const ativos = funcionarios.filter((f) => f.status === "ATIVO");
  const folhaSemanal = ativos.reduce((t, f) => t + f.salario, 0);
  const totalAtrasado = ativos.reduce((t, f) => t + f.valorAtrasado, 0);
  const inativos = funcionarios.length - ativos.length;

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return funcionarios.filter(
      (f) => (mostrarInativos || f.status === "ATIVO") && (!termo || normalizar(`${f.nome} ${f.funcao ?? ""} ${f.telefone ?? ""} ${f.cpf ?? ""}`).includes(termo))
    );
  }, [busca, funcionarios, mostrarInativos]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl text-sm text-muted">
          Os salários são pagos <strong className="text-ink">todo sábado</strong>. Cada sábado entra sozinho em{" "}
          <Link to="/financeiro/contas-a-pagar" className="font-semibold text-primary underline-offset-2 hover:underline">Contas a Pagar</Link>, onde você confirma se foi pago.
        </p>
        <Button tamanho="grande" className="shrink-0 whitespace-nowrap" onClick={() => setEdicao({})}>
          <IconeMais tamanho={20} />
          Novo funcionário
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Funcionários ativos</p><p className="mt-1 font-display text-3xl text-ink">{ativos.length}</p></Card>
        <Card><p className="text-sm text-muted">Total a pagar por sábado</p><p className="mt-1 whitespace-nowrap font-display text-3xl text-ink">{formatarMoeda(folhaSemanal)}</p></Card>
        <Card className={totalAtrasado > 0 ? "border-danger/40 bg-danger/[0.04]" : ""}>
          <p className="text-sm text-muted">Sábados atrasados (não confirmados)</p>
          <p className={`mt-1 whitespace-nowrap font-display text-3xl ${totalAtrasado > 0 ? "text-danger" : "text-success"}`}>{totalAtrasado > 0 ? formatarMoeda(totalAtrasado) : "Tudo em dia"}</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1"><Input aria-label="Buscar funcionário" placeholder="Buscar por nome, função, telefone ou CPF..." value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          {inativos > 0 && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} className="h-5 w-5 accent-primary" />
              Mostrar desligados ({inativos})
            </label>
          )}
        </div>
      </Card>

      {aviso && <p role="status" className="rounded-lg bg-success/10 px-4 py-3 text-sm font-semibold text-success">{aviso}</p>}
      {erro && <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}
      {carregando && <Card><p className="text-sm text-muted">Carregando...</p></Card>}
      {!carregando && visiveis.length === 0 && (
        <Card className="py-10 text-center">
          <p className="font-semibold text-ink">{busca ? "Nenhum funcionário encontrado." : "Nenhum funcionário cadastrado ainda."}</p>
          <p className="mt-1 text-sm text-muted">Cadastre a equipe para os salários de sábado aparecerem em Contas a Pagar.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {visiveis.map((f) => {
          const whatsapp = f.telefone ? linkWhatsApp(f.telefone) : null;
          const inativo = f.status === "INATIVO";
          return (
            <Card key={f.id} className={`flex flex-col ${inativo ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-display text-xl uppercase text-ink">{f.nome}</p>
                  <p className="text-sm text-muted">{f.funcao || "Função não informada"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${f.registrado ? "bg-success/10 text-success" : "bg-gold/15 text-gold-texto"}`}>{f.registrado ? "Registrado" : "Sem registro"}</span>
                  {inativo && <span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted">Desligado</span>}
                </div>
              </div>

              <div className="mt-4 flex items-baseline justify-between rounded-lg bg-background px-3 py-2.5">
                <span className="text-sm text-muted">Salário por sábado</span>
                <span className="font-display text-2xl text-ink">{formatarMoeda(f.salario)}</span>
              </div>

              {!inativo && (
                <div className="mt-2 grid grid-cols-1 gap-1 text-sm">
                  {f.proximoPagamento && <p className="text-ink">📅 Próximo pagamento: <strong>sáb {formatarDataCalendario(f.proximoPagamento.data).slice(0, 5)}</strong> · {formatarMoeda(f.proximoPagamento.valor)}</p>}
                  {f.atrasados > 0 && <p className="font-semibold text-danger">⚠ {f.atrasados} sábado(s) sem confirmar pagamento · {formatarMoeda(f.valorAtrasado)}</p>}
                  {f.ultimoPagamento && <p className="text-muted">Último pago: sáb {formatarDataCalendario(f.ultimoPagamento.data).slice(0, 5)}</p>}
                </div>
              )}

              <dl className="mt-3 grid grid-cols-1 gap-1.5 border-t border-border pt-3 text-sm">
                {f.telefone && <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted">Telefone</dt><dd>{whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer" className="font-semibold text-success hover:underline">{f.telefone}</a> : f.telefone}</dd></div>}
                {f.endereco && <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted">Endereço</dt><dd className="min-w-0 break-words text-ink">{f.endereco}</dd></div>}
                {f.chavePix && <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted">Chave Pix</dt><dd className="min-w-0 break-all text-ink">{f.chavePix}</dd></div>}
                {f.cpf && <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted">CPF</dt><dd className="text-ink">{f.cpf}</dd></div>}
                {f.dataAdmissao && <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted">Admissão</dt><dd className="text-ink">{formatarDataCalendario(f.dataAdmissao)}</dd></div>}
              </dl>

              <div className="mt-auto flex gap-2 pt-4">
                <Button variante="secundaria" className="flex-1" onClick={() => setEdicao({ funcionario: f })}><IconeLapis tamanho={16} />Alterar</Button>
                {!inativo && <Button variante="secundaria" className="flex-1 !text-danger hover:!bg-danger/5" aria-label={`Excluir ${f.nome}`} onClick={() => setExclusao(f)}><IconeLixeira tamanho={16} />Excluir</Button>}
              </div>
            </Card>
          );
        })}
      </div>

      {edicao && (
        <ModalFuncionario
          funcionario={edicao.funcionario}
          onFechar={() => setEdicao(null)}
          onSalvo={(nome) => { setEdicao(null); setAviso(`${nome} salvo. Os sábados já estão em Contas a Pagar.`); carregar(); }}
        />
      )}
      {exclusao && (
        <ModalExcluir
          funcionario={exclusao}
          onFechar={() => setExclusao(null)}
          onExcluido={(mensagem) => { setExclusao(null); setAviso(mensagem); carregar(); }}
        />
      )}
    </div>
  );
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:px-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-card bg-surface p-5 shadow-2xl sm:rounded-card sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-2xl uppercase text-ink">{titulo}</p>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 shrink-0 text-2xl text-muted">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFuncionario({ funcionario, onFechar, onSalvo }: { funcionario?: Funcionario; onFechar: () => void; onSalvo: (nome: string) => void }) {
  const f = funcionario;
  const dia = (v?: string | null) => (v ? v.slice(0, 10) : "");
  const [dados, setDados] = useState({
    nome: f?.nome ?? "",
    funcao: f?.funcao ?? "",
    telefone: f?.telefone ?? "",
    endereco: f?.endereco ?? "",
    cpf: f?.cpf ?? "",
    rg: f?.rg ?? "",
    dataNascimento: dia(f?.dataNascimento),
    dataAdmissao: dia(f?.dataAdmissao),
    salario: f ? String(f.salario) : "",
    chavePix: f?.chavePix ?? "",
    observacoes: f?.observacoes ?? "",
    inicioPagamentos: dia(f?.inicioPagamentos) || proximoSabado(),
  });
  const [registrado, setRegistrado] = useState(f?.registrado ?? false);
  const [ativo, setAtivo] = useState(f ? f.status === "ATIVO" : true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const campo = (nome: keyof typeof dados) => ({ value: dados[nome], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDados((d) => ({ ...d, [nome]: e.target.value })) });
  const salarioNumero = Number(dados.salario.replace(",", ".")) || 0;
  const mudouSalario = f && salarioNumero > 0 && salarioNumero !== f.salario;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    if (salarioNumero <= 0) return setErro("Informe o valor pago no sábado.");
    if (!ehSabado(dados.inicioPagamentos)) return setErro("O primeiro pagamento precisa cair num sábado.");
    setSalvando(true);
    const corpo = {
      ...dados,
      salario: salarioNumero,
      registrado,
      dataNascimento: dados.dataNascimento || null,
      dataAdmissao: dados.dataAdmissao || null,
      ...(f ? { status: ativo ? "ATIVO" : "INATIVO" } : {}),
    };
    try {
      await api(f ? `/funcionarios/${f.id}` : "/funcionarios", { method: f ? "PUT" : "POST", body: corpo });
      onSalvo(dados.nome.trim());
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar o funcionário.");
    } finally {
      setSalvando(false);
    }
  }

  const opcao = (ligado: boolean) => `min-h-11 rounded-lg border-2 px-3 text-sm font-semibold transition ${ligado ? "border-primary bg-primary/[0.07] text-primary" : "border-border bg-white text-ink hover:border-primary/50"}`;

  return (
    <Modal titulo={f ? "Alterar funcionário" : "Novo funcionário"} onFechar={onFechar}>
      <form onSubmit={salvar} className="mt-4 flex flex-col gap-5">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Nome completo" required autoFocus={!f} {...campo("nome")} />
          <Input label="Função" placeholder="Ex.: açougueiro, caixa, entregador" {...campo("funcao")} />
          <Input label="Telefone / WhatsApp" type="tel" inputMode="tel" placeholder="(00) 00000-0000" {...campo("telefone")} />
          <Input label="Data de admissão" type="date" {...campo("dataAdmissao")} />
          <div className="sm:col-span-2"><Input label="Endereço (onde mora)" placeholder="Rua, número, bairro, cidade" {...campo("endereco")} /></div>
          <Input label="CPF" inputMode="numeric" {...campo("cpf")} />
          <Input label="RG" {...campo("rg")} />
          <Input label="Data de nascimento" type="date" {...campo("dataNascimento")} />
          <Input label="Chave Pix (para pagar)" {...campo("chavePix")} />
        </section>

        <fieldset>
          <legend className="text-sm font-medium text-ink">Está registrado (carteira assinada)?</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={registrado} onClick={() => setRegistrado(true)} className={opcao(registrado)}>Sim, registrado</button>
            <button type="button" aria-pressed={!registrado} onClick={() => setRegistrado(false)} className={opcao(!registrado)}>Não, sem registro</button>
          </div>
        </fieldset>

        <section className="rounded-xl border-2 border-primary/20 bg-primary/[0.04] p-4">
          <p className="font-semibold text-ink">💰 Pagamento — todo sábado</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Valor pago em cada sábado (R$)" type="number" inputMode="decimal" min="0.01" step="0.01" required {...campo("salario")} />
            <Input label="Primeiro sábado a pagar" type="date" required {...campo("inicioPagamentos")} />
          </div>
          {dados.inicioPagamentos && !ehSabado(dados.inicioPagamentos) && <p className="mt-2 text-xs font-semibold text-danger">Essa data não é sábado.</p>}
          <p className="mt-2 text-xs text-muted">
            A partir desse sábado, todo sábado entra em Contas a Pagar com o valor de {formatarMoeda(salarioNumero)}.
            {mudouSalario && " O novo valor vale para os próximos sábados ainda não pagos."}
          </p>
        </section>

        {f && (
          <fieldset>
            <legend className="text-sm font-medium text-ink">Situação</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={ativo} onClick={() => setAtivo(true)} className={opcao(ativo)}>Trabalhando</button>
              <button type="button" aria-pressed={!ativo} onClick={() => setAtivo(false)} className={opcao(!ativo)}>Desligado</button>
            </div>
            {!ativo && f.status === "ATIVO" && <p className="mt-1.5 text-xs text-muted">Os próximos sábados ainda não pagos saem de Contas a Pagar.</p>}
          </fieldset>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="obs-funcionario" className="text-sm font-medium text-ink">Observações (opcional)</label>
          <textarea id="obs-funcionario" rows={2} {...campo("observacoes")} className="w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm outline-none focus:border-primary" placeholder="Ex.: folga às quartas, vale-transporte..." />
        </div>

        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" tamanho="grande" disabled={salvando}>{salvando ? "Salvando..." : f ? "Salvar alterações" : "Cadastrar funcionário"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ModalExcluir({ funcionario, onFechar, onExcluido }: { funcionario: Funcionario; onFechar: () => void; onExcluido: (mensagem: string) => void }) {
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    setErro("");
    setExcluindo(true);
    try {
      const r = await api<{ excluido: boolean; desativado: boolean }>(`/funcionarios/${funcionario.id}`, { method: "DELETE" });
      onExcluido(r.desativado ? `${funcionario.nome} foi desligado. Os salários já pagos continuam no histórico.` : `${funcionario.nome} foi excluído.`);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir.");
      setExcluindo(false);
    }
  }

  return (
    <Modal titulo="Excluir funcionário?" onFechar={onFechar}>
      <div className="mt-4 rounded-lg bg-background p-4 text-sm">
        <p className="font-semibold text-ink">{funcionario.nome}</p>
        <p className="text-muted">{funcionario.funcao || "Sem função"} · {formatarMoeda(funcionario.salario)} por sábado</p>
      </div>
      <p className="mt-4 text-sm text-ink">Os próximos sábados ainda não pagos saem de Contas a Pagar. Se ele já recebeu algum salário pelo sistema, fica como “Desligado” para não perder o histórico.</p>
      {funcionario.atrasados > 0 && <p className="mt-2 rounded-lg bg-gold/15 px-3 py-2 text-sm text-ink">Atenção: há {funcionario.atrasados} sábado(s) já vencido(s) sem confirmar pagamento. Eles continuam em Contas a Pagar.</p>}
      {erro && <p role="alert" className="mt-3 text-sm text-danger">{erro}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variante="secundaria" onClick={onFechar}>Não, manter</Button>
        <Button variante="perigo" disabled={excluindo} onClick={excluir}><IconeLixeira tamanho={16} />{excluindo ? "Excluindo..." : "Sim, excluir"}</Button>
      </div>
    </Modal>
  );
}
