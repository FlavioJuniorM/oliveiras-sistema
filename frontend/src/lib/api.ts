const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

function obterToken() {
  return localStorage.getItem("oliveiras_token");
}

interface OpcoesRequisicao {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

export class ErroApi extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

/**
 * Wrapper único para todas as chamadas à API — injeta o token JWT automaticamente
 * e padroniza o tratamento de erro (o backend sempre responde { erro: "..." }).
 */
export async function api<T = unknown>(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
  const token = obterToken();

  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    method: opcoes.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    throw new ErroApi(dados.erro || "Erro inesperado ao comunicar com o servidor.", resposta.status);
  }

  return dados as T;
}
