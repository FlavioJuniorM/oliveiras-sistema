import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../../lib/api";
import { dataLocalISO, formatarDataCalendario, formatarMoeda } from "../../lib/formatadores";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { IconeDownload, IconeLapis, IconeLixeira, IconeMais } from "../../components/ui/Icones";
import type { FolhaFuncionario } from "./folhaPdf";
import { BotaoAnexar, ListaAnexos, type Anexo } from "../../components/anexos/Anexos";
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
  const [descontosDe, setDescontosDe] = useState<Funcionario | null>(null);
  const [folha, setFolha] = useState<{ funcionario?: Funcionario } | null>(null);
  const [historicoDe, setHistoricoDe] = useState<Funcionario | null>(null);

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
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button variante="secundaria" tamanho="grande" className="whitespace-nowrap" onClick={() => setFolha({})}>
            🧾 Folha da semana
          </Button>
          <Button tamanho="grande" className="whitespace-nowrap" onClick={() => setEdicao({})}>
            <IconeMais tamanho={20} />
            Novo funcionário
          </Button>
        </div>
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
                  <button type="button" onClick={() => setHistoricoDe(f)} className="text-left" title="Ver histórico de pagamentos">
                    <span className="break-words font-display text-xl uppercase text-ink underline decoration-primary/40 decoration-2 underline-offset-4 hover:text-primary">{f.nome}</span>
                    <span className="block text-xs font-semibold text-primary">Ver histórico de pagamentos ›</span>
                  </button>
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

              {!inativo && (
                <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                  <Button variante="secundaria" onClick={() => setDescontosDe(f)}>💸 Descontos</Button>
                  <Button variante="secundaria" onClick={() => setFolha({ funcionario: f })}>🧾 Folha / recibo</Button>
                </div>
              )}
              <div className={`flex gap-2 ${inativo ? "mt-auto pt-4" : "pt-2"}`}>
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
      {descontosDe && <ModalDescontos funcionario={descontosDe} onFechar={() => setDescontosDe(null)} onMudou={carregar} />}
      {historicoDe && <ModalHistorico funcionario={historicoDe} onFechar={() => setHistoricoDe(null)} onFolha={() => { setFolha({ funcionario: historicoDe }); setHistoricoDe(null); }} />}
      {folha && <ModalFolha funcionario={folha.funcionario} onFechar={() => setFolha(null)} />}
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

// ───────────── Descontos (adiantamento, vale, carne...) ─────────────

interface Desconto {
  id: string;
  grupoId: string;
  tipo: "ADIANTAMENTO" | "VALE" | "CARNE" | "OUTRO";
  rotulo: string;
  data: string;
  valor: number;
  descricao: string | null;
  sabado: string | null;
  sabadoPago: boolean;
}

const TIPOS_DESCONTO: { id: Desconto["tipo"]; rotulo: string; icone: string; exemplo: string }[] = [
  { id: "ADIANTAMENTO", rotulo: "Adiantamento", icone: "💵", exemplo: "Ex.: adiantamento em dinheiro" },
  { id: "VALE", rotulo: "Vale", icone: "🎟️", exemplo: "Ex.: vale para o mercado" },
  { id: "CARNE", rotulo: "Carne / produtos", icone: "🥩", exemplo: "Ex.: 2 kg de picanha" },
  { id: "OUTRO", rotulo: "Outro", icone: "📝", exemplo: "Ex.: quebra de material" },
];

/** Sábado em que o desconto vai entrar: o primeiro a partir do dia em que pegou, mas nunca um que já passou. */
function sabadoDoDesconto(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  const doDia = d.toISOString().slice(0, 10);
  const deHoje = proximoSabado();
  return doDia > deHoje ? doDia : deHoje;
}

const sabadoCurto = (iso: string) => `sáb ${formatarDataCalendario(iso).slice(0, 5)}`;

function ModalDescontos({ funcionario, onFechar, onMudou }: { funcionario: Funcionario; onFechar: () => void; onMudou: () => void }) {
  const [descontos, setDescontos] = useState<Desconto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tipo, setTipo] = useState<Desconto["tipo"]>("VALE");
  const [data, setData] = useState(dataLocalISO());
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [excluindo, setExcluindo] = useState<string | null>(null);

  async function carregar() {
    try {
      setDescontos(await api<Desconto[]>(`/funcionarios/${funcionario.id}/descontos`));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar os descontos.");
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionario.id]);

  const valorNumero = Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
  const sabadoAlvo = data ? sabadoDoDesconto(data) : "";
  const passaDoSalario = valorNumero > funcionario.salario;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
    if (valorNumero <= 0) return setErro("Informe o valor.");
    setSalvando(true);
    try {
      const r = await api<{ partes: { sabado: string; valor: number }[] }>(`/funcionarios/${funcionario.id}/descontos`, {
        method: "POST",
        body: { tipo, data, valor: valorNumero, descricao: descricao.trim() || null },
      });
      setAviso(`Lançado! ${r.partes.map((p) => `${formatarMoeda(p.valor)} no ${sabadoCurto(p.sabado)}`).join(" e ")}. Já aparece em Contas a Pagar.`);
      setValor("");
      setDescricao("");
      await carregar();
      onMudou();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível lançar o desconto.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(d: Desconto) {
    setErro("");
    setAviso("");
    setExcluindo(d.id);
    try {
      await api(`/funcionarios/descontos/${d.id}`, { method: "DELETE" });
      setAviso("Desconto excluído. O salário do sábado voltou ao valor certo.");
      await carregar();
      onMudou();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir.");
    } finally {
      setExcluindo(null);
    }
  }

  // Agrupa as partes do mesmo desconto (quando passou do salário e foi para o sábado seguinte)
  const grupos = useMemo(() => {
    const mapa = new Map<string, Desconto[]>();
    for (const d of descontos) mapa.set(d.grupoId, [...(mapa.get(d.grupoId) ?? []), d]);
    return Array.from(mapa.values());
  }, [descontos]);
  const pendentes = descontos.filter((d) => !d.sabadoPago).reduce((t, d) => t + d.valor, 0);

  return (
    <Modal titulo={`Descontos — ${funcionario.nome}`} onFechar={onFechar}>
      <p className="mt-1 text-sm text-muted">Adiantamento, vale ou carne que ele pegou. O valor sai do <strong className="text-ink">próximo sábado ainda não pago</strong> e já aparece em Contas a Pagar.</p>

      <form onSubmit={salvar} className="mt-4 flex flex-col gap-4 rounded-lg border-2 border-primary/15 bg-primary/[0.03] p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIPOS_DESCONTO.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              aria-pressed={tipo === t.id}
              className={`min-h-12 rounded-lg border px-2 py-2 text-sm font-semibold transition ${tipo === t.id ? "border-primary bg-primary text-white" : "border-border bg-white text-ink hover:border-ink/40"}`}
            >
              <span className="mr-1" aria-hidden>{t.icone}</span>{t.rotulo}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Dia em que pegou" type="date" value={data} max={dataLocalISO()} onChange={(e) => setData(e.target.value)} required />
          <Input label="Valor (R$)" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} required />
        </div>
        <Input label="Descrição (opcional)" placeholder={TIPOS_DESCONTO.find((t) => t.id === tipo)?.exemplo} value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} />
        {sabadoAlvo && (
          <p className="rounded-lg bg-white px-3 py-2 text-sm text-ink">
            📅 Será descontado no <strong>{sabadoCurto(sabadoAlvo)}</strong>
            {valorNumero > 0 && <> · salário de {formatarMoeda(funcionario.salario)} → <strong>{formatarMoeda(Math.max(funcionario.salario - valorNumero, 0))}</strong></>}
            {passaDoSalario && <span className="mt-1 block text-xs text-gold-texto">O valor passa do salário de um sábado: o restante será descontado no sábado seguinte.</span>}
          </p>
        )}
        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        {aviso && <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success">{aviso}</p>}
        <Button type="submit" tamanho="grande" disabled={salvando}><IconeMais tamanho={18} />{salvando ? "Lançando..." : "Lançar desconto"}</Button>
      </form>

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <p className="font-semibold text-ink">Descontos lançados</p>
        {pendentes > 0 && <p className="text-sm text-muted">A descontar: <strong className="text-danger">{formatarMoeda(pendentes)}</strong></p>}
      </div>
      {carregando ? (
        <p className="mt-2 text-sm text-muted">Carregando...</p>
      ) : grupos.length === 0 ? (
        <p className="mt-2 rounded-lg bg-background px-3 py-4 text-center text-sm text-muted">Nenhum desconto lançado.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {grupos.map((partes) => {
            const d = partes[0];
            const total = partes.reduce((t, p) => t + p.valor, 0);
            const pago = partes.some((p) => p.sabadoPago);
            const info = TIPOS_DESCONTO.find((t) => t.id === d.tipo);
            return (
              <li key={d.grupoId} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink"><span aria-hidden>{info?.icone} </span><strong>{d.rotulo}</strong>{d.descricao && <span className="text-muted"> · {d.descricao}</span>}</p>
                  <p className="text-xs text-muted">
                    Pegou em {formatarDataCalendario(d.data)} · descontado no{" "}
                    {partes.map((p) => (p.sabado ? `${sabadoCurto(p.sabado)}${partes.length > 1 ? ` (${formatarMoeda(p.valor)})` : ""}` : "sábado excluído")).join(" e ")}
                    {pago && <span className="ml-1 font-semibold text-success">· já pago</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <strong className="whitespace-nowrap text-danger">− {formatarMoeda(total)}</strong>
                  {!pago && (
                    <button
                      type="button"
                      onClick={() => excluir(d)}
                      disabled={excluindo === d.id}
                      aria-label={`Excluir ${d.rotulo} de ${formatarMoeda(total)}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-danger hover:bg-danger/5 disabled:opacity-40"
                    >
                      <IconeLixeira tamanho={16} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

// ───────────── Folha de pagamento (recibo para assinar) ─────────────

/** Sábados para escolher: o desta semana e os 12 anteriores (a semana vira no domingo). */
function sabadosParaEscolher() {
  const base = new Date(`${proximoSabado()}T12:00:00Z`);
  const lista: string[] = [];
  for (let i = -12; i <= 0; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i * 7);
    lista.push(d.toISOString().slice(0, 10));
  }
  return lista.reverse();
}

function ModalFolha({ funcionario, onFechar }: { funcionario?: Funcionario; onFechar: () => void }) {
  const sabados = useMemo(sabadosParaEscolher, []);
  const [sabado, setSabado] = useState(proximoSabado());
  const [folhas, setFolhas] = useState<FolhaFuncionario[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro("");
    api<FolhaFuncionario[]>(`/funcionarios/folha?sabado=${sabado}${funcionario ? `&funcionarioId=${funcionario.id}` : ""}`)
      .then((r) => !cancelado && setFolhas(r))
      .catch((e) => !cancelado && setErro(e instanceof ErroApi ? e.message : "Não foi possível montar a folha."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [sabado, funcionario]);

  async function baixar() {
    if (!folhas?.length) return;
    setGerando(true);
    try {
      const { gerarPdfFolha } = await import("./folhaPdf");
      await gerarPdfFolha(folhas);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível gerar o PDF.");
    } finally {
      setGerando(false);
    }
  }

  const totais = (folhas ?? []).reduce((t, f) => ({ bruto: t.bruto + f.salarioBruto, desc: t.desc + f.totalDescontos, liq: t.liq + f.liquido }), { bruto: 0, desc: 0, liq: 0 });

  return (
    <Modal titulo={funcionario ? `Folha de pagamento — ${funcionario.nome}` : "Folha de pagamento da semana"} onFechar={onFechar}>
      <p className="mt-1 text-sm text-muted">Recibo com salário, descontos e valor líquido para o funcionário conferir e assinar. Sai em 2 vias (empresa e funcionário).</p>
      <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-ink">
        Sábado do pagamento
        <select value={sabado} onChange={(e) => setSabado(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none">
          {sabados.map((s) => (
            <option key={s} value={s}>
              {formatarDataCalendario(s)}{s === proximoSabado() ? " (este sábado)" : s < proximoSabado() ? " (já passou)" : ""}
            </option>
          ))}
        </select>
      </label>

      {erro && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {carregando && <p className="mt-4 text-sm text-muted">Carregando...</p>}
      {!carregando && folhas && folhas.length === 0 && <p className="mt-4 rounded-lg bg-background px-3 py-4 text-center text-sm text-muted">Nenhum salário lançado nesse sábado.</p>}
      {!carregando && folhas && folhas.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="bg-background text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Funcionário</th>
                <th className="px-3 py-2 text-right font-medium">Salário</th>
                <th className="px-3 py-2 text-right font-medium">Descontos</th>
                <th className="px-3 py-2 text-right font-medium">A receber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {folhas.map((f) => (
                <tr key={f.contaId}>
                  <td className="px-3 py-2">
                    <span className="font-semibold text-ink">{f.funcionario.nome}</span>
                    {f.descontos.length > 0 && <span className="block text-xs text-muted">{f.descontos.map((d) => `${d.rotulo} ${formatarMoeda(d.valor)}`).join(" · ")}</span>}
                    {f.status === "PAGO" && f.valorPago > 0 && <span className="block text-xs font-semibold text-success">Pago</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatarMoeda(f.salarioBruto)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-danger">{f.totalDescontos > 0 ? `− ${formatarMoeda(f.totalDescontos)}` : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-ink">{formatarMoeda(f.liquido)}</td>
                </tr>
              ))}
            </tbody>
            {folhas.length > 1 && (
              <tfoot>
                <tr className="bg-background font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatarMoeda(totais.bruto)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-danger">− {formatarMoeda(totais.desc)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatarMoeda(totais.liq)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variante="secundaria" onClick={onFechar}>Fechar</Button>
        <Button tamanho="grande" disabled={!folhas?.length || gerando || carregando} onClick={baixar}>
          <IconeDownload tamanho={18} />
          {gerando ? "Gerando PDF..." : folhas && folhas.length > 1 ? `Baixar PDF (${folhas.length} recibos)` : "Baixar PDF para assinar"}
        </Button>
      </div>
    </Modal>
  );
}

// ───────────── Histórico de pagamentos do funcionário ─────────────

interface PagamentoHistorico {
  contaId: string;
  sabado: string;
  salarioBruto: number;
  totalDescontos: number;
  liquido: number;
  valorPago: number;
  status: string;
  dataPagamento: string | null;
  formaPagamento: string | null;
  descontos: Desconto[];
  anexos: Anexo[];
}

interface Historico {
  funcionario: { id: string; nome: string; funcao: string | null; salario: number; registrado: boolean };
  resumo: { totalRecebido: number; totalDescontado: number; semanasPagas: number; semRecibo: number };
  pagamentos: PagamentoHistorico[];
}

function ModalHistorico({ funcionario, onFechar, onFolha }: { funcionario: Funcionario; onFechar: () => void; onFolha: () => void }) {
  const [dados, setDados] = useState<Historico | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "pagos" | "abertos" | "semRecibo">("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  async function carregar() {
    try {
      setDados(await api<Historico>(`/funcionarios/${funcionario.id}/historico`));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar o histórico.");
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionario.id]);

  async function baixarRecibo(sabado: string) {
    setBaixando(sabado);
    try {
      const folhas = await api<FolhaFuncionario[]>(`/funcionarios/folha?sabado=${sabado.slice(0, 10)}&funcionarioId=${funcionario.id}`);
      const { gerarPdfFolha } = await import("./folhaPdf");
      await gerarPdfFolha(folhas);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível gerar o recibo.");
    } finally {
      setBaixando(null);
    }
  }

  const temRecibo = (p: PagamentoHistorico) => p.anexos.some((a) => a.tipo === "RECIBO_ASSINADO");
  const [mesesAbertos, setMesesAbertos] = useState<Set<string>>(new Set([dataLocalISO().slice(0, 7)]));
  const alternarMes = (chave: string) =>
    setMesesAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  const lista = (dados?.pagamentos ?? []).filter((p) =>
    filtro === "pagos" ? p.status === "PAGO" : filtro === "abertos" ? p.status !== "PAGO" : filtro === "semRecibo" ? p.status === "PAGO" && !temRecibo(p) : true
  );
  // Mês a mês (pelo sábado do pagamento), do mais recente para o mais antigo
  const meses = useMemo(() => {
    const NOMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const mapa = new Map<string, { chave: string; rotulo: string; semanas: PagamentoHistorico[]; pago: number; aPagar: number; descontos: number }>();
    for (const p of lista) {
      const chave = p.sabado.slice(0, 7);
      const m = mapa.get(chave) ?? { chave, rotulo: `${NOMES[Number(chave.slice(5, 7)) - 1]} ${chave.slice(0, 4)}`, semanas: [], pago: 0, aPagar: 0, descontos: 0 };
      m.semanas.push(p);
      if (p.status === "PAGO") m.pago += p.valorPago;
      else m.aPagar += p.liquido - p.valorPago;
      m.descontos += p.totalDescontos;
      mapa.set(chave, m);
    }
    return Array.from(mapa.values()).sort((a, b) => b.chave.localeCompare(a.chave));
  }, [lista]);
  const STATUS: Record<string, [string, string]> = {
    PAGO: ["Pago", "bg-success/10 text-success"],
    VENCIDO: ["Não confirmado", "bg-danger/10 text-danger"],
    PARCIAL: ["Pago em parte", "bg-gold/15 text-gold-texto"],
    PENDENTE: ["A pagar", "bg-primary/10 text-primary"],
  };

  return (
    <Modal titulo={funcionario.nome} onFechar={onFechar}>
      <p className="text-sm text-muted">{funcionario.funcao || "Função não informada"} · {formatarMoeda(funcionario.salario)} por sábado · {funcionario.registrado ? "carteira assinada" : "sem registro"}</p>

      {dados && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-success/[0.08] px-3 py-2"><p className="text-xs text-muted">Total recebido</p><p className="whitespace-nowrap font-display text-lg text-success">{formatarMoeda(dados.resumo.totalRecebido)}</p></div>
          <div className="rounded-lg bg-background px-3 py-2"><p className="text-xs text-muted">Semanas pagas</p><p className="font-display text-lg text-ink">{dados.resumo.semanasPagas}</p></div>
          <div className="rounded-lg bg-danger/[0.06] px-3 py-2"><p className="text-xs text-muted">Total descontado</p><p className="whitespace-nowrap font-display text-lg text-danger">{formatarMoeda(dados.resumo.totalDescontado)}</p></div>
          <button type="button" onClick={() => setFiltro("semRecibo")} className={`rounded-lg px-3 py-2 text-left ${dados.resumo.semRecibo ? "bg-gold/15" : "bg-background"}`}>
            <p className="text-xs text-muted">Pagos sem recibo assinado</p>
            <p className={`font-display text-lg ${dados.resumo.semRecibo ? "text-gold-texto" : "text-success"}`}>{dados.resumo.semRecibo || "Nenhum"}</p>
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {([
          ["todos", "Todos"],
          ["pagos", "Pagos"],
          ["abertos", "A pagar"],
          ["semRecibo", "Sem recibo"],
        ] as const).map(([id, rotulo]) => (
          <button key={id} type="button" onClick={() => setFiltro(id)} className={`h-9 rounded-full border px-3.5 text-sm font-semibold ${filtro === id ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"}`}>
            {rotulo}
          </button>
        ))}
        <button type="button" onClick={onFolha} className="ml-auto h-9 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/5">🧾 Gerar folha</button>
      </div>

      {erro && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {!dados && !erro && <p className="mt-4 text-sm text-muted">Carregando...</p>}
      {dados && lista.length === 0 && <p className="mt-4 rounded-lg bg-background px-3 py-6 text-center text-sm text-muted">Nada aqui.</p>}

      {meses.map((m) => {
        const mesAberto = mesesAbertos.has(m.chave);
        return (
          <section key={m.chave} className="mt-3 overflow-hidden rounded-lg border border-border">
            <button type="button" onClick={() => alternarMes(m.chave)} aria-expanded={mesAberto} className="flex w-full items-center gap-3 bg-background px-3 py-3 text-left hover:bg-black/[0.03]">
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg uppercase text-ink">{m.rotulo}</span>
                <span className="block text-xs text-muted">
                  {m.semanas.length} semana(s)
                  {m.pago > 0 && <> · <span className="font-semibold text-success">recebeu {formatarMoeda(m.pago)}</span></>}
                  {m.aPagar > 0 && <> · <span className="font-semibold text-primary">a pagar {formatarMoeda(m.aPagar)}</span></>}
                  {m.descontos > 0 && <> · <span className="text-danger">descontos {formatarMoeda(m.descontos)}</span></>}
                </span>
              </span>
              <span className={`shrink-0 text-muted transition-transform ${mesAberto ? "rotate-90" : ""}`} aria-hidden>›</span>
            </button>
            {mesAberto && (
              <ul className="flex flex-col gap-2 p-2">
                {m.semanas.map((p) => {
          const [rotuloStatus, corStatus] = STATUS[p.status] ?? [p.status, "bg-background text-muted"];
          const expandido = aberto === p.contaId;
          return (
            <li key={p.contaId} className="rounded-lg border border-border">
              <button type="button" onClick={() => setAberto(expandido ? null : p.contaId)} aria-expanded={expandido} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-background/60">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">Sábado {formatarDataCalendario(p.sabado)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${corStatus}`}>{rotuloStatus}</span>
                    {p.totalDescontos > 0 && <span className="text-danger">− {formatarMoeda(p.totalDescontos)} em descontos</span>}
                    {p.status === "PAGO" && (temRecibo(p) ? <span className="font-semibold text-success">✔ recibo assinado</span> : <span className="font-semibold text-gold-texto">sem recibo assinado</span>)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="whitespace-nowrap font-display text-lg text-ink">{formatarMoeda(p.status === "PAGO" ? p.valorPago || p.liquido : p.liquido)}</p>
                  {p.totalDescontos > 0 && <p className="text-[11px] text-muted">de {formatarMoeda(p.salarioBruto)}</p>}
                </div>
                <span className={`shrink-0 text-muted transition-transform ${expandido ? "rotate-90" : ""}`} aria-hidden>›</span>
              </button>
              {expandido && (
                <div className="border-t border-border px-3 pb-3 pt-2 text-sm">
                  <ul className="divide-y divide-border">
                    <li className="flex justify-between gap-3 py-1.5"><span className="text-ink">Salário da semana</span><strong className="whitespace-nowrap">{formatarMoeda(p.salarioBruto)}</strong></li>
                    {p.descontos.map((d) => (
                      <li key={d.id} className="flex justify-between gap-3 py-1.5">
                        <span className="min-w-0 text-ink">{d.rotulo}<span className="block text-xs text-muted">Pegou em {formatarDataCalendario(d.data)}{d.descricao ? ` · ${d.descricao}` : ""}</span></span>
                        <strong className="whitespace-nowrap text-danger">− {formatarMoeda(d.valor)}</strong>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 py-1.5"><span className="font-semibold text-ink">Valor líquido</span><strong className="whitespace-nowrap">{formatarMoeda(p.liquido)}</strong></li>
                  </ul>
                  {p.dataPagamento && <p className="mt-1 text-xs text-muted">Pago em {formatarDataCalendario(p.dataPagamento.slice(0, 10))}{p.formaPagamento ? ` · ${p.formaPagamento}` : ""}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <ListaAnexos anexos={p.anexos} onExcluido={carregar} />
                    <BotaoAnexar contaPagarId={p.contaId} tipo="RECIBO_ASSINADO" rotulo="Anexar recibo assinado" onEnviado={carregar} />
                    <button type="button" onClick={() => baixarRecibo(p.sabado)} disabled={baixando === p.sabado} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-ink hover:bg-background disabled:opacity-50">
                      🧾 {baixando === p.sabado ? "Gerando..." : "Recibo para assinar (PDF)"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
              </ul>
            )}
          </section>
        );
      })}
    </Modal>
  );
}
