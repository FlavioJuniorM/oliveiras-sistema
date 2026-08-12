import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Usuario } from "../types";

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (login: string, senha: string) => Promise<void>;
  sair: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

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
    const resposta = await api<{ token: string; usuario: Usuario }>("/auth/login", {
      method: "POST",
      body: { login, senha },
    });
    localStorage.setItem("oliveiras_token", resposta.token);
    setUsuario(resposta.usuario);
  }

  function sair() {
    localStorage.removeItem("oliveiras_token");
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, sair }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return contexto;
}
