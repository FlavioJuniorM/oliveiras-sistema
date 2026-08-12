import { FormEvent, useEffect, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { Usuario } from "../../types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";

interface UsuarioLista extends Usuario {
  login: string;
  status: string;
}

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

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

      <Card padded={false}>
        <div className="divide-y divide-border">
          {usuarios.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-medium text-ink">{u.nome}</p>
                <p className="text-xs text-muted mt-0.5">{u.login}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted">
                  {u.papel === "ADMINISTRATIVO" ? "Administrativo" : "Funcionário"}
                </span>
                <StatusBadge status={u.status} />
              </div>
            </div>
          ))}
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
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await api("/usuarios", { method: "POST", body: { nome, login, senha, papel } });
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
