import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ErroApi } from "../lib/api";
import { Button } from "../components/ui/Button";

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
      await entrar(login, senha);
      navegar("/");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#191516] px-4 py-6 sm:px-8 lg:py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
      <main className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden flex-col justify-between bg-gradient-to-br from-primary via-[#a30d28] to-[#45131e] p-10 text-white lg:flex xl:p-14">
          <div>
            <div className="flex items-center gap-3"><img src="/logo-oliveiras.png" alt="Casa de Carnes Oliveiras" className="h-16 w-16 rounded-2xl bg-white p-1 shadow-xl" /><div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Casa de Carnes</p><p className="font-display text-3xl tracking-wide">OLIVEIRAS</p></div></div>
            <div className="mt-20 max-w-lg"><p className="text-sm font-semibold uppercase tracking-[0.25em] text-gold-light">Gestão feita para o balcão</p><h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-wide xl:text-6xl">Seu pedido, do corte à entrega.</h1><p className="mt-6 max-w-md text-base leading-7 text-white/75">Organize clientes, cortes, expedição e pagamentos em um só lugar.</p></div>
          </div>
          <div className="grid grid-cols-3 gap-3"><Destaque numero="01" texto="Comandas" /><Destaque numero="02" texto="Cortes" /><Destaque numero="03" texto="Entregas" /></div>
        </section>

        <section className="flex items-center justify-center bg-[#fbfaf8] p-5 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden"><img src="/logo-oliveiras.png" alt="Casa de Carnes Oliveiras" className="h-14 w-14 rounded-2xl shadow-lg" /><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Casa de Carnes</p><p className="font-display text-2xl tracking-wide text-ink">OLIVEIRAS</p></div></div>
            <div className="mb-8"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Área restrita</p><h2 className="mt-2 font-display text-4xl tracking-wide text-ink">Bem-vindo de volta</h2><p className="mt-3 text-sm leading-6 text-muted">Entre para acompanhar os pedidos e manter a operação em movimento.</p></div>
            <form onSubmit={aoEnviar} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5"><label htmlFor="login" className="text-sm font-semibold text-ink">Login</label><input id="login" autoFocus value={login} onChange={(e) => setLogin(e.target.value)} placeholder="seu.usuario" className="h-13 rounded-xl border border-border bg-white px-4 text-ink shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" /></div>
              <div className="flex flex-col gap-1.5"><label htmlFor="senha" className="text-sm font-semibold text-ink">Senha</label><div className="relative"><input id="senha" type={mostrarSenha ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Digite sua senha" className="h-13 w-full rounded-xl border border-border bg-white px-4 pr-20 text-ink shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" /><button type="button" onClick={() => setMostrarSenha((atual) => !atual)} className="absolute right-3 top-1/2 -translate-y-1/2 px-2 text-xs font-semibold text-muted hover:text-primary">{mostrarSenha ? "Ocultar" : "Mostrar"}</button></div></div>
              {erro && <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"><span className="font-bold">!</span><span>{erro}</span></div>}
              <Button type="submit" disabled={enviando} tamanho="grande" className="mt-1 w-full rounded-xl shadow-lg shadow-primary/20">{enviando ? "Validando acesso..." : "Entrar no sistema"}</Button>
            </form>
            <div className="mt-8 flex items-center gap-3 rounded-xl bg-background px-4 py-3 text-xs text-muted"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">✓</span><span>Acesso protegido para a equipe Oliveiras.</span></div>
            <p className="mt-8 text-center text-xs text-muted">Qualidade que você confia, sabor que você aprova.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Destaque({ numero, texto }: { numero: string; texto: string }) {
  return <div className="rounded-2xl border border-white/15 bg-black/10 p-4"><p className="font-display text-2xl text-gold-light">{numero}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/70">{texto}</p></div>;
}
