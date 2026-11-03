import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ErroApi } from "../lib/api";

/**
 * Tela de login em tela cheia:
 * - esquerda (computador): painel vinho com a logo grande e o slogan da marca;
 * - direita: formulário com campos e botão grandes, fáceis de usar no balcão;
 * - celular: logo no topo e formulário logo abaixo.
 */
export function Login() {
  const { entrar } = useAuth();
  const navegar = useNavigate();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const { trocarSenha } = await entrar(login, senha);
      navegar(trocarSenha ? "/minha-senha" : "/");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const classeCampo =
    "h-14 w-full rounded-xl border-2 border-border bg-white px-5 text-lg text-ink outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-4 focus:ring-primary/15";

  return (
    <div className="flex min-h-screen flex-col bg-[#fbfaf8] lg:flex-row">
      {/* Painel da marca */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#7a0a1d] via-[#5c0816] to-[#2a060c] px-6 py-8 text-white lg:w-[55%] lg:py-16">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/40 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-gold/20 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-col items-center text-center">
          {/* A imagem tem cantos pretos: o recorte redondo mostra só o selo */}
          <div className="rounded-full bg-white p-2 shadow-[0_30px_80px_rgba(0,0,0,0.45)] ring-4 ring-white/15 sm:p-3">
            <img
              src="/logo-oliveiras.png"
              alt="Casa de Carnes Oliveiras"
              className="aspect-square w-32 scale-[1.03] rounded-full object-cover sm:w-52 lg:w-[min(26rem,34vw)]"
            />
          </div>
          <p className="mt-6 font-display text-xl uppercase tracking-[0.2em] text-gold-light sm:text-2xl lg:mt-10 lg:text-3xl">O Rei da Costela</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.35em] text-white/60 lg:text-sm">Desde 1994</p>
        </div>
      </section>

      {/* Formulário */}
      <section className="flex flex-1 items-start justify-center px-6 py-10 sm:items-center sm:px-10 lg:py-16">
        <div className="w-full max-w-lg">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary">Área restrita</p>
          <h1 className="mt-2 font-display text-4xl tracking-wide text-ink sm:text-5xl">Bem-vindo de volta</h1>
          <p className="mt-3 text-base leading-7 text-muted">Entre com seu usuário para acompanhar os pedidos do balcão.</p>

          <form onSubmit={aoEnviar} className="mt-10 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="login" className="text-base font-semibold text-ink">Login</label>
              <input id="login" autoFocus autoComplete="username" autoCapitalize="none" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="seu.usuario" className={classeCampo} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="senha" className="text-base font-semibold text-ink">Senha</label>
              <div className="relative">
                <input id="senha" type={mostrarSenha ? "text" : "password"} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Digite sua senha" className={`${classeCampo} pr-28`} />
                <button type="button" onClick={() => setMostrarSenha((atual) => !atual)} aria-pressed={mostrarSenha} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:bg-background hover:text-primary">
                  {mostrarSenha ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>
            {erro && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-base text-danger">
                <span className="font-bold">!</span><span>{erro}</span>
              </div>
            )}
            <button type="submit" disabled={enviando} className="mt-2 h-16 w-full rounded-xl bg-primary text-lg font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-dark disabled:opacity-60">
              {enviando ? "Validando acesso..." : "Entrar no sistema"}
            </button>
          </form>

          <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/10 text-success" aria-hidden="true">✓</span>
            Acesso exclusivo da equipe Casa de Carnes Oliveiras
          </p>
        </div>
      </section>
    </div>
  );
}
