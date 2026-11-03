import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ErroApi } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardTitulo } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

export function MinhaSenha() {
  const { usuario, precisaTrocarSenha, senhaTrocada } = useAuth();
  const navegar = useNavigate();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    if (novaSenha.length < 8) return setErro("A nova senha deve ter pelo menos 8 caracteres.");
    if (novaSenha !== confirmacao) return setErro("A confirmação não é igual à nova senha.");
    setSalvando(true);
    try {
      await api("/auth/senha", { method: "POST", body: { senhaAtual, novaSenha } });
      senhaTrocada();
      setSucesso(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível trocar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardTitulo>Trocar minha senha</CardTitulo>
        <p className="mt-1 text-sm text-muted">Usuário: <strong className="text-ink">{usuario?.nome}</strong></p>
        {precisaTrocarSenha && !sucesso && (
          <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            Sua senha atual é fraca ou é a senha padrão do sistema. Troque antes de continuar.
          </p>
        )}
        {sucesso ? (
          <div className="mt-4">
            <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success">Senha trocada com sucesso.</p>
            <Button className="mt-4 w-full" onClick={() => navegar(usuario?.papel === "ADMINISTRATIVO" ? "/" : "/pedidos")}>Continuar</Button>
          </div>
        ) : (
          <form onSubmit={salvar} className="mt-4 flex flex-col gap-3">
            <Input label="Senha atual" type="password" autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} required />
            <Input label="Nova senha (mínimo 8 caracteres)" type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
            <Input label="Repita a nova senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
            <p className="text-xs text-muted">Dica: use uma frase fácil de lembrar, como “picanha-na-brasa-94”.</p>
            {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
            <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Trocar senha"}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
