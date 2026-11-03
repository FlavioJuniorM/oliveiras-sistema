import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Usuario } from "../types";

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (login: string, senha: string) => Promise<{ trocarSenha: boolean }>;
  sair: () => void;
  /** Entrou com senha padrão/fraca: o sistema mostra o aviso para trocar */
  precisaTrocarSenha: boolean;
  senhaTrocada: () => void;
}

const CHAVE_TROCAR_SENHA = "oliveiras_trocar_senha";

function lerAvisoSenha() {
  try {
    return localStorage.getItem(CHAVE_TROCAR_SENHA) === "1";
  } catch {
    return false;
  }
}

function gravarAvisoSenha(ativo: boolean) {
  try {
    if (ativo) localStorage.setItem(CHAVE_TROCAR_SENHA, "1");
    else localStorage.removeItem(CHAVE_TROCAR_SENHA);
  } catch {
    // armazenamento indisponível: o aviso só dura enquanto a página estiver aberta
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [precisaTrocarSenha, setPrecisaTrocarSenha] = useState(lerAvisoSenha);

  useEffect(() => {
    const token = localStorage.getItem("oliveiras_token");
    if (!token) {
      setCarregando(false);
      return;
    }

    api<{ usuario: Usuario }>("/auth/me")
      .then((resposta) => setUsuario(resposta.usuario))
      .catch(() => {
        localStorage.removeItem("oliveiras_token");
      })
      .finally(() => setCarregando(false));
  }, []);

  async function entrar(login: string, senha: string) {
    const resposta = await api<{ token: string; usuario: Usuario; trocarSenha?: boolean }>("/auth/login", {
      method: "POST",
      body: { login, senha },
    });
    localStorage.setItem("oliveiras_token", resposta.token);
    setUsuario(resposta.usuario);
    const trocarSenha = Boolean(resposta.trocarSenha);
    setPrecisaTrocarSenha(trocarSenha);
    gravarAvisoSenha(trocarSenha);
    return { trocarSenha };
  }

  function sair() {
    localStorage.removeItem("oliveiras_token");
    gravarAvisoSenha(false);
    setPrecisaTrocarSenha(false);
    setUsuario(null);
  }

  function senhaTrocada() {
    gravarAvisoSenha(false);
    setPrecisaTrocarSenha(false);
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, sair, precisaTrocarSenha, senhaTrocada }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return contexto;
}
