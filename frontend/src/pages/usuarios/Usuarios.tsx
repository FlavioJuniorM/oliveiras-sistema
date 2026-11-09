import { FormEvent, useEffect, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { Usuario } from "../../types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { IconeLapis, IconeLixeira } from "../../components/ui/Icones";
import { useAuth } from "../../contexts/AuthContext";

interface UsuarioLista extends Usuario {
  login: string;
  status: string;
  email?: string | null;
  avisosEmail?: boolean;
}

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [edicao, setEdicao] = useState<UsuarioLista | null>(null);
  const [exclusao, setExclusao] = useState<UsuarioLista | null>(null);
  const [aviso, setAviso] = useState("");
  const { usuario: eu } = useAuth();

  function carregar() {
    api<UsuarioLista[]>("/usuarios").then(setUsuarios);
  }

  useEffect(carregar, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <p className="text-muted text-sm">{usuarios.length} usuário(s)</p>
        <Button onClick={() => setMostrarFormulario(true)}>Novo usuário</Button>
      </div>

      {mostrarFormulario && (
        <FormularioUsuario
          onCancelar={() => setMostrarFormulario(false)}
          onCriado={() => {
            setMostrarFormulario(false);
            carregar();
          }}
        />
      )}

      {aviso && <p role="status" className="rounded-lg bg-success/10 px-4 py-3 text-sm font-semibold text-success">{aviso}</p>}
      {edicao && <ModalAlterarUsuario usuario={edicao} souEu={edicao.id === eu?.id} onFechar={() => setEdicao(null)} onSalvo={(u) => { setEdicao(null); setAviso(`Usuário ${u.nome} atualizado.`); carregar(); }} />}
      {exclusao && <ModalExcluirUsuario usuario={exclusao} onFechar={() => setExclusao(null)} onExcluido={(mensagem) => { setExclusao(null); setAviso(mensagem); carregar(); }} />}
      <CartaoAvisoEmail />
      <Card padded={false}>
        <div className="divide-y divide-border">
          {usuarios.map((u) => {
            const souEu = u.id === eu?.id;
            return (
            <div key={u.id} className={`flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between ${u.status === "INATIVO" ? "bg-background/60" : ""}`}>
              <div className="min-w-0">
                <p className="font-medium text-ink">{u.nome}{souEu && <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold-texto">você</span>}</p>
                <p className="text-xs text-muted mt-0.5">Login: {u.login} · {u.papel === "ADMINISTRATIVO" ? "Administrativo" : "Funcionário"}</p>
                <p className="text-xs mt-0.5">{u.email ? <span className="text-ink">✉ {u.email}{u.papel === "ADMINISTRATIVO" && u.avisosEmail ? <span className="ml-1 text-success">· recebe o aviso das contas</span> : ""}</span> : <span className="text-muted">Sem e-mail</span>}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={u.status} />
                <RedefinirSenha usuarioId={u.id} nome={u.nome} />
                <Button variante="secundaria" onClick={() => setEdicao(u)}><IconeLapis tamanho={16} />Alterar</Button>
                {!souEu && <Button variante="secundaria" className="!text-danger hover:!bg-danger/5" aria-label={`Excluir ${u.nome}`} onClick={() => setExclusao(u)}><IconeLixeira tamanho={16} />Excluir</Button>}
              </div>
            </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function FormularioUsuario({ onCancelar, onCriado }: { onCancelar: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<"FUNCIONARIO" | "ADMINISTRATIVO">("FUNCIONARIO");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await api("/usuarios", { method: "POST", body: { nome, login, senha, papel, email: email.trim() || null } });
      onCriado();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Erro ao criar usuário.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <form onSubmit={aoEnviar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Input label="Login" value={login} onChange={(e) => setLogin(e.target.value)} required />
        <Input
          label="Senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Papel</label>
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value as any)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"
          >
            <option value="FUNCIONARIO">Funcionário</option>
            <option value="ADMINISTRATIVO">Administrativo</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <Input label="E-mail (opcional)" type="email" placeholder="para receber o aviso das contas do dia" value={email} onChange={(e) => setEmail(e.target.value)} />
          <p className="mt-1 text-xs text-muted">Administradores com e-mail recebem todo dia de manhã o resumo das contas a pagar.</p>
        </div>

        {erro && <p className="text-sm text-danger sm:col-span-2">{erro}</p>}

        <div className="flex gap-2 sm:col-span-2">
          <Button type="button" variante="secundaria" onClick={onCancelar} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando} className="flex-1">
            {enviando ? "Salvando..." : "Salvar usuário"}
          </Button>
        </div>
      </form>
    </Card>
  );
}


/** Administrador define uma nova senha para o usuário (ex.: funcionário esqueceu). */
function RedefinirSenha({ usuarioId, nome }: { usuarioId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro("");
    setSalvando(true);
    try {
      await api(`/usuarios/${usuarioId}/senha`, { method: "PATCH", body: { novaSenha: senha } });
      setMensagem(`Senha de ${nome} redefinida.`);
      setSenha("");
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível redefinir a senha.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return <>{mensagem && <span className="text-xs font-semibold text-success">{mensagem}</span>}<Button variante="fantasma" onClick={() => { setAberto(true); setMensagem(""); }}>Redefinir senha</Button></>;
  return <div className="flex flex-wrap items-center gap-2"><input type="password" placeholder="Nova senha (mín. 8)" value={senha} onChange={(e) => setSenha(e.target.value)} className="h-10 rounded-lg border border-border px-3 text-sm" aria-label={`Nova senha para ${nome}`} autoFocus /><Button disabled={salvando || senha.length < 8} onClick={salvar}>{salvando ? "..." : "Salvar"}</Button><Button variante="secundaria" onClick={() => { setAberto(false); setErro(""); }}>Cancelar</Button>{erro && <span className="w-full text-xs text-danger">{erro}</span>}</div>;
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:px-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface p-5 shadow-2xl sm:rounded-card sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-2xl uppercase text-ink">{titulo}</p>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 shrink-0 text-2xl text-muted">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalAlterarUsuario({ usuario, souEu, onFechar, onSalvo }: { usuario: UsuarioLista; souEu: boolean; onFechar: () => void; onSalvo: (u: UsuarioLista) => void }) {
  const [nome, setNome] = useState(usuario.nome);
  const [login, setLogin] = useState(usuario.login);
  const [papel, setPapel] = useState(usuario.papel);
  const [status, setStatus] = useState(usuario.status);
  const [email, setEmail] = useState(usuario.email ?? "");
  const [avisosEmail, setAvisosEmail] = useState(usuario.avisosEmail ?? true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      onSalvo(await api<UsuarioLista>(`/usuarios/${usuario.id}`, { method: "PUT", body: { nome, login: login.trim(), papel, status, email: email.trim() || null, avisosEmail } }));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível alterar o usuário.");
    } finally {
      setSalvando(false);
    }
  }

  const opcao = (ativo: boolean) => `min-h-11 rounded-lg border-2 px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${ativo ? "border-primary bg-primary/[0.07] text-primary" : "border-border bg-white text-ink hover:border-primary/50"}`;

  return (
    <Modal titulo="Alterar usuário" onFechar={onFechar}>
      <form onSubmit={salvar} className="mt-4 flex flex-col gap-4">
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Input label="Login (usado para entrar)" value={login} onChange={(e) => setLogin(e.target.value)} autoCapitalize="none" required />
        <fieldset>
          <legend className="text-sm font-medium text-ink">Papel</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button type="button" disabled={souEu} aria-pressed={papel === "FUNCIONARIO"} onClick={() => setPapel("FUNCIONARIO")} className={opcao(papel === "FUNCIONARIO")}>Funcionário</button>
            <button type="button" disabled={souEu} aria-pressed={papel === "ADMINISTRATIVO"} onClick={() => setPapel("ADMINISTRATIVO")} className={opcao(papel === "ADMINISTRATIVO")}>Administrativo</button>
          </div>
          <p className="mt-1.5 text-xs text-muted">Funcionário: balcão e pedidos. Administrativo: também financeiro, relatórios e usuários.</p>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium text-ink">Acesso</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button type="button" disabled={souEu} aria-pressed={status === "ATIVO"} onClick={() => setStatus("ATIVO")} className={opcao(status === "ATIVO")}>Ativo (pode entrar)</button>
            <button type="button" disabled={souEu} aria-pressed={status === "INATIVO"} onClick={() => setStatus("INATIVO")} className={opcao(status === "INATIVO")}>Inativo (bloqueado)</button>
          </div>
          {souEu && <p className="mt-1.5 text-xs text-muted">Você não pode mudar o papel nem bloquear o seu próprio usuário.</p>}
        </fieldset>
        <div className="rounded-lg border border-border bg-background p-3">
          <Input label="E-mail" type="email" placeholder="nome@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink">
            <input type="checkbox" className="h-5 w-5 accent-primary" checked={avisosEmail} onChange={(e) => setAvisosEmail(e.target.checked)} disabled={papel !== "ADMINISTRATIVO"} />
            Receber todo dia o e-mail com as contas a pagar
          </label>
          {papel !== "ADMINISTRATIVO" && <p className="text-xs text-muted">Só administradores recebem o resumo financeiro.</p>}
        </div>
        <p className="text-xs text-muted">Para trocar a senha, use “Redefinir senha” na lista.</p>
        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar alterações"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ModalExcluirUsuario({ usuario, onFechar, onExcluido }: { usuario: UsuarioLista; onFechar: () => void; onExcluido: (mensagem: string) => void }) {
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    setErro("");
    setExcluindo(true);
    try {
      const r = await api<{ excluido: boolean; desativado: boolean }>(`/usuarios/${usuario.id}`, { method: "DELETE" });
      onExcluido(r.desativado ? `${usuario.nome} não consegue mais entrar. O nome dele continua no histórico das comandas.` : `${usuario.nome} foi excluído.`);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir o usuário.");
      setExcluindo(false);
    }
  }

  return (
    <Modal titulo="Excluir usuário?" onFechar={onFechar}>
      <div className="mt-4 rounded-lg bg-background p-4 text-sm">
        <p className="font-semibold text-ink">{usuario.nome}</p>
        <p className="text-muted">Login: {usuario.login} · {usuario.papel === "ADMINISTRATIVO" ? "Administrativo" : "Funcionário"}</p>
      </div>
      <p className="mt-4 text-sm text-ink">Ele perde o acesso na hora, mesmo se estiver com o sistema aberto. Se já trabalhou em comandas, o nome dele continua no histórico (fica como “Inativo” na lista).</p>
      {erro && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variante="secundaria" onClick={onFechar}>Não, manter</Button>
        <Button variante="perigo" disabled={excluindo} onClick={excluir}><IconeLixeira tamanho={16} />{excluindo ? "Excluindo..." : "Sim, excluir"}</Button>
      </div>
    </Modal>
  );
}

/** Situação do e-mail diário de contas a pagar + botão para testar. */
function CartaoAvisoEmail() {
  const [status, setStatus] = useState<{ emailConfigurado: boolean; agendado: boolean } | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);

  useEffect(() => {
    api<{ emailConfigurado: boolean; agendado: boolean }>("/avisos/status").then(setStatus).catch(() => setStatus(null));
  }, []);

  async function testar() {
    setErro(""); setMensagem(""); setEnviando(true);
    try {
      const r = await api<{ para: string }>("/avisos/teste", { method: "POST" });
      setMensagem(`E-mail de teste enviado para ${r.para}. Confira a caixa de entrada (e o spam).`);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  async function verPrevia() {
    try { setPrevia((await api<{ html: string }>("/avisos/previa")).html); } catch { setErro("Não foi possível montar a prévia."); }
  }

  const pronto = status?.emailConfigurado && status?.agendado;
  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-semibold text-ink">✉ Aviso diário das contas a pagar</p>
          <p className="mt-1 text-sm text-muted">Todo dia, às 7h, os administradores com e-mail recebem quais contas vencem no dia (e as atrasadas), com os códigos de barras.</p>
          {status && (
            <p className={`mt-2 text-sm font-semibold ${pronto ? "text-success" : "text-gold-texto"}`}>
              {pronto ? "● Envio automático ligado" : "● Falta configurar o envio no servidor (veja as instruções que o suporte passou)"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variante="secundaria" onClick={verPrevia}>Ver prévia</Button>
          <Button disabled={enviando || !status?.emailConfigurado} onClick={testar}>{enviando ? "Enviando..." : "Enviar teste para mim"}</Button>
        </div>
      </div>
      {mensagem && <p role="status" className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{mensagem}</p>}
      {erro && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {previa && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:px-4" onClick={() => setPrevia(null)}>
          <div role="dialog" aria-modal="true" aria-label="Prévia do e-mail" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-card bg-white p-4 shadow-2xl sm:rounded-card" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="font-display text-xl uppercase text-ink">Prévia do e-mail de hoje</p><button type="button" aria-label="Fechar" onClick={() => setPrevia(null)} className="h-10 w-10 text-2xl text-muted">×</button></div>
            <iframe title="Prévia do e-mail" sandbox="" srcDoc={previa} className="h-[70vh] w-full rounded-lg border border-border" />
          </div>
        </div>
      )}
    </Card>
  );
}
