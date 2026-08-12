import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ErroApi } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function Login() {
  const { entrar } = useAuth();
  const navegar = useNavigate();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

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
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/logo-oliveiras.png"
            alt="Casa de Carnes Oliveiras"
            className="h-24 w-24 rounded-full mb-4"
          />
          <p className="font-display text-white/80 tracking-widest text-sm">CASA DE CARNES</p>
          <p className="font-display text-white text-3xl tracking-wide -mt-1">OLIVEIRAS</p>
        </div>

        <form
          onSubmit={aoEnviar}
          className="bg-surface rounded-card shadow-card border border-white/5 p-6 flex flex-col gap-4"
        >
          <Input
            id="login"
            label="Login"
            autoFocus
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="seu.usuario"
          />
          <Input
            id="senha"
            label="Senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
          />

          {erro && (
            <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{erro}</p>
          )}

          <Button type="submit" disabled={enviando} className="mt-2 w-full" tamanho="grande">
            {enviando ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <p className="text-center text-white/40 text-xs mt-6">
          Qualidade que você confia, sabor que você aprova.
        </p>
      </div>
    </div>
  );
}
