import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

export const CATEGORIAS_CONTA = ["Fornecedores", "Energia", "Água", "Aluguel", "Funcionários", "Impostos", "Manutenção", "Outros"];

export interface Fornecedor {
  id: string;
  nome: string;
  documento: string | null;
  telefone: string | null;
  contato: string | null;
  categoriaPadrao: string;
  observacoes: string | null;
  status: "ATIVO" | "INATIVO";
  quantidadeContas?: number;
}

export type DadosFornecedor = Pick<Fornecedor, "nome" | "documento" | "telefone" | "contato" | "categoriaPadrao" | "observacoes">;

/** Busca sem acento e sem diferenciar maiúsculas: "frigorifico" acha "Frigorífico". */
export function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Campos do fornecedor, usados no cadastro completo e no cadastro rápido. */
export function CamposFornecedor({
  dados,
  onMudar,
  completo = true,
}: {
  dados: DadosFornecedor;
  onMudar: (dados: DadosFornecedor) => void;
  completo?: boolean;
}) {
  const idCategoria = useId();
  const idObs = useId();
  const mudar = (campo: keyof DadosFornecedor, valor: string) => onMudar({ ...dados, [campo]: valor });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input label="Nome do fornecedor" value={dados.nome} onChange={(e) => mudar("nome", e.target.value)} required autoFocus={completo} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idCategoria} className="text-sm font-medium text-ink">Tipo de conta (categoria)</label>
        <select id={idCategoria} value={dados.categoriaPadrao} onChange={(e) => mudar("categoriaPadrao", e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm">
          {CATEGORIAS_CONTA.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <Input label="Telefone / WhatsApp" type="tel" inputMode="tel" placeholder="(00) 00000-0000" value={dados.telefone ?? ""} onChange={(e) => mudar("telefone", e.target.value)} />
      <Input label="CNPJ ou CPF (opcional)" inputMode="numeric" value={dados.documento ?? ""} onChange={(e) => mudar("documento", e.target.value)} />
      {completo && (
        <>
          <Input label="Vendedor / contato (opcional)" value={dados.contato ?? ""} onChange={(e) => mudar("contato", e.target.value)} />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={idObs} className="text-sm font-medium text-ink">Observações (opcional)</label>
            <textarea id={idObs} rows={2} value={dados.observacoes ?? ""} onChange={(e) => mudar("observacoes", e.target.value)} placeholder="Ex.: entrega às terças, pagamento por boleto 28 dias" className="w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm outline-none focus:border-primary" />
          </div>
        </>
      )}
    </div>
  );
}

export function dadosVazios(nome = ""): DadosFornecedor {
  return { nome, documento: "", telefone: "", contato: "", categoriaPadrao: "Fornecedores", observacoes: "" };
}

/**
 * Campo "Fornecedor" do lançamento de Contas a Pagar.
 * Busca nos fornecedores cadastrados (e puxa a categoria deles);
 * se não achar, permite cadastrar ali mesmo, de forma rápida.
 */
export function CampoFornecedor({
  valor,
  onMudar,
  onEscolher,
}: {
  valor: string;
  onMudar: (nome: string) => void;
  onEscolher: (fornecedor: Fornecedor) => void;
}) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const [cadastroRapido, setCadastroRapido] = useState<DadosFornecedor | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const caixaRef = useRef<HTMLDivElement>(null);
  const idCampo = useId();
  const idLista = useId();

  useEffect(() => {
    api<Fornecedor[]>("/fornecedores").then(setFornecedores).catch(() => setFornecedores([]));
  }, []);

  // Fecha a lista ao clicar fora
  useEffect(() => {
    function fora(evento: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(evento.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const termo = normalizar(valor);
  const sugestoes = useMemo(
    () => (termo ? fornecedores.filter((f) => normalizar(f.nome).includes(termo) || (f.contato && normalizar(f.contato).includes(termo))) : fornecedores).slice(0, 8),
    [fornecedores, termo]
  );
  const selecionado = fornecedores.find((f) => normalizar(f.nome) === termo);
  const naoCadastrado = valor.trim().length >= 2 && !selecionado;

  function escolher(fornecedor: Fornecedor) {
    onMudar(fornecedor.nome);
    onEscolher(fornecedor);
    setAberto(false);
    setCadastroRapido(null);
  }

  async function cadastrar() {
    if (!cadastroRapido || cadastroRapido.nome.trim().length < 2) return setErro("Informe o nome do fornecedor.");
    setSalvando(true);
    setErro("");
    try {
      const novo = await api<Fornecedor>("/fornecedores", { method: "POST", body: cadastroRapido });
      setFornecedores((atuais) => [...atuais, novo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      escolher(novo);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível cadastrar o fornecedor.");
    } finally {
      setSalvando(false);
    }
  }

  function teclado(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto && (evento.key === "ArrowDown" || evento.key === "ArrowUp")) return setAberto(true);
    if (evento.key === "ArrowDown") { evento.preventDefault(); setDestaque((d) => Math.min(d + 1, sugestoes.length - 1)); }
    if (evento.key === "ArrowUp") { evento.preventDefault(); setDestaque((d) => Math.max(d - 1, 0)); }
    if (evento.key === "Enter" && aberto && sugestoes[destaque]) { evento.preventDefault(); escolher(sugestoes[destaque]); }
    if (evento.key === "Escape") setAberto(false);
  }

  return (
    <div ref={caixaRef} className="relative flex flex-col gap-1.5 sm:col-span-2">
      <label htmlFor={idCampo} className="text-sm font-medium text-ink">Fornecedor</label>
      <input
        id={idCampo}
        role="combobox"
        aria-expanded={aberto && sugestoes.length > 0}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Digite para buscar nos fornecedores cadastrados"
        value={valor}
        required
        onChange={(e) => { onMudar(e.target.value); setAberto(true); setDestaque(0); setCadastroRapido(null); }}
        onFocus={() => setAberto(true)}
        onKeyDown={teclado}
        className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      {aberto && sugestoes.length > 0 && !selecionado && (
        <ul id={idLista} role="listbox" className="absolute left-0 right-0 top-[4.6rem] z-20 max-h-72 overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-xl">
          {sugestoes.map((f, i) => (
            <li key={f.id} role="option" aria-selected={i === destaque}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(f)}
                onMouseEnter={() => setDestaque(i)}
                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left ${i === destaque ? "bg-primary/[0.06]" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{f.nome}</span>
                  <span className="block truncate text-xs text-muted">{[f.telefone, f.contato, f.documento].filter(Boolean).join(" · ") || "Sem contato cadastrado"}</span>
                </span>
                <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted">{f.categoriaPadrao}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selecionado && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-success/[0.08] px-3 py-2 text-xs text-ink">
          <span className="font-semibold text-success">✓ Fornecedor cadastrado</span>
          {[selecionado.telefone, selecionado.contato, selecionado.documento].filter(Boolean).map((info) => <span key={info} className="text-muted">· {info}</span>)}
        </p>
      )}

      {naoCadastrado && !cadastroRapido && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-gold/60 bg-gold/[0.07] px-3 py-2">
          <p className="text-sm text-ink">“{valor.trim()}” não está cadastrado.</p>
          <Button type="button" variante="secundaria" className="h-9 px-3" onClick={() => { setCadastroRapido(dadosVazios(valor.trim())); setAberto(false); setErro(""); }}>+ Cadastrar fornecedor</Button>
        </div>
      )}

      {cadastroRapido && (
        <div className="rounded-xl border-2 border-primary/25 bg-primary/[0.04] p-4" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); cadastrar(); } }}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">Cadastro rápido de fornecedor</p>
              <p className="text-xs text-muted">Só o nome é obrigatório. Os outros dados dá para completar depois em Financeiro › Fornecedores.</p>
            </div>
            <button type="button" onClick={() => setCadastroRapido(null)} aria-label="Fechar cadastro rápido" className="h-8 w-8 shrink-0 text-xl text-muted">×</button>
          </div>
          <CamposFornecedor dados={cadastroRapido} onMudar={setCadastroRapido} completo={false} />
          {erro && <p role="alert" className="mt-3 text-sm text-danger">{erro}</p>}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variante="secundaria" onClick={() => setCadastroRapido(null)}>Cancelar</Button>
            <Button type="button" disabled={salvando} onClick={() => cadastrar()}>{salvando ? "Cadastrando..." : "Cadastrar e usar"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
