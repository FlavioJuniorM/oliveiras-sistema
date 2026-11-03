import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { formatarMoeda } from "../../lib/formatadores";
import { Produto } from "../../types";

interface Categoria { id: string; nome: string }
import { useAuth } from "../../contexts/AuthContext";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";

export function Produtos() {
  const { usuario } = useAuth();
  const ehAdmin = usuario?.papel === "ADMINISTRATIVO";
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [produtoAlterando, setProdutoAlterando] = useState<Produto | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    try { setProdutos(await api<Produto[]>(ehAdmin ? "/produtos?todos=true" : "/produtos")); setErro(""); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao carregar carnes."); }
  }
  useEffect(() => { carregar(); }, [ehAdmin]);
  useEffect(() => { api<Categoria[]>("/categorias").then((lista) => setCategorias([...lista].sort((a, b) => ordemCategoria(a.nome) - ordemCategoria(b.nome)))).catch(() => setCategorias([])); }, []);

  const visiveis = useMemo(() => produtos.filter((produto) => {
    const texto = `${produto.nome} ${produto.codigo} ${produto.categoria?.nome || ""}`.toLowerCase();
    return texto.includes(busca.toLowerCase())
      && (filtroStatus === "TODOS" || produto.status === filtroStatus)
      && (filtroCategoria === "TODAS" || produto.categoria?.id === filtroCategoria);
  }), [produtos, busca, filtroStatus, filtroCategoria]);

  async function excluir(produto: Produto) {
    if (!window.confirm(`Excluir ${produto.nome}? Produtos usados em pedidos serão apenas inativados.`)) return;
    try { await api(`/produtos/${produto.id}`, { method: "DELETE" }); await carregar(); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao excluir produto."); }
  }

  return <div className="flex flex-col gap-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-muted text-sm">{visiveis.length} produto(s) visível(is)</p></div>{ehAdmin && <Button onClick={() => setMostrarFormulario(true)}>Novo corte</Button>}</div><div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Filtrar por tipo de carne">{[{ id: "TODAS", nome: "Todas" }, ...categorias].map((categoria) => { const ativo = filtroCategoria === categoria.id; const quantidade = categoria.id === "TODAS" ? produtos.length : produtos.filter((produto) => produto.categoria?.id === categoria.id).length; return <button key={categoria.id} type="button" role="tab" aria-selected={ativo} onClick={() => setFiltroCategoria(categoria.id)} className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition ${ativo ? "border-primary bg-primary text-white" : "border-border bg-surface text-ink hover:border-primary"}`}>{nomeCurtoCategoria(categoria.nome)} <span className={ativo ? "text-white/80" : "text-muted"}>{quantidade}</span></button>; })}</div><div className="flex flex-col gap-3 sm:flex-row"><Input placeholder="Pesquisar por nome, código ou categoria..." value={busca} onChange={(e) => setBusca(e.target.value)} className="sm:flex-1" /><select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="TODOS">Todos os status</option><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option></select></div>{erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}{mostrarFormulario && <FormularioProduto categorias={categorias} onCancelar={() => setMostrarFormulario(false)} onSalvo={(produto) => { setMostrarFormulario(false); setProdutos((atuais) => [produto, ...atuais]); }} />}{visiveis.length === 0 && <Card className="text-center py-12"><p className="font-display text-2xl uppercase text-ink">Nenhuma carne encontrada</p></Card>}<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{visiveis.map((produto) => <Card key={produto.id} className={produto.status === "INATIVO" ? "opacity-60" : ""}><div className="flex items-start justify-between gap-3"><div><p className="font-display text-xl uppercase tracking-wide text-ink">{produto.nome}</p><p className="text-xs text-muted mt-1">Código {produto.codigo}{produto.categoria ? ` · ${produto.categoria.nome}` : ""}</p></div><StatusBadge status={produto.status} /></div><div className="mt-5 flex items-end justify-between border-t border-border pt-4"><div><p className="text-xs text-muted">Preço atual</p><p className="font-display text-2xl text-gold-texto mt-1">{formatarMoeda(produto.preco)}<span className="text-sm text-muted">/{produto.unidadeMedida}</span></p></div><p className="text-xs text-muted">{produto.tipoVenda === "PESO" ? "Peso variável" : produto.tipoVenda === "UNIDADE" ? "Por unidade" : "Pacote"}</p></div>{ehAdmin && <div className="mt-4 flex flex-wrap gap-2"><Button variante="secundaria" tamanho="padrao" className="flex-1" onClick={() => setProdutoAlterando(produto)}>Alterar</Button><Button variante="perigo" tamanho="padrao" onClick={() => excluir(produto)}>Excluir</Button></div>}</Card>)}</div>{produtoAlterando && <ModalAlterarProduto produto={produtoAlterando} categorias={categorias} onFechar={() => setProdutoAlterando(null)} onSalvo={() => { setProdutoAlterando(null); carregar(); }} />}</div>;
}

function FormularioProduto({ produto, categorias, onCancelar, onSalvo }: { produto?: Produto; categorias: Categoria[]; onCancelar: () => void; onSalvo: (produto: Produto) => void }) {
  const [categoriaId, setCategoriaId] = useState(produto?.categoria?.id || "");
  const [codigo, setCodigo] = useState(produto?.codigo || "");
  const [nome, setNome] = useState(produto?.nome || "");
  const [preco, setPreco] = useState(produto ? String(produto.preco) : "");
  const [tipoVenda, setTipoVenda] = useState<Produto["tipoVenda"]>(produto?.tipoVenda || "PESO");
  const [unidadeMedida, setUnidadeMedida] = useState(produto?.unidadeMedida || "kg");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) { evento.preventDefault(); setErro(""); setEnviando(true); try { const salvo = await api<Produto>(produto ? `/produtos/${produto.id}` : "/produtos", { method: produto ? "PUT" : "POST", body: produto ? { codigo, nome, tipoVenda, unidadeMedida, categoriaId: categoriaId || undefined } : { codigo, nome, preco: Number(preco.replace(",", ".")), tipoVenda, unidadeMedida, categoriaId: categoriaId || undefined } }); onSalvo(salvo); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao salvar produto."); } finally { setEnviando(false); } }
  return <Card><div className="flex items-center justify-between mb-4"><div><p className="font-display text-2xl uppercase text-ink">{produto ? "Editar corte" : "Novo corte"}</p><p className="text-sm text-muted">O preço tem edição separada para manter o histórico.</p></div><button type="button" onClick={onCancelar} className="text-2xl text-muted">×</button></div><form onSubmit={aoEnviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Input label="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} required /><Input label="Nome do corte" value={nome} onChange={(e) => setNome(e.target.value)} required /><SeletorCategoria categorias={categorias} valor={categoriaId} onMudar={setCategoriaId} /><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Tipo de venda</label><select value={tipoVenda} onChange={(e) => setTipoVenda(e.target.value as Produto["tipoVenda"])} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="PESO">Peso variável</option><option value="UNIDADE">Unidade</option><option value="PACOTE_FIXO">Pacote fixo</option></select></div><Input label="Unidade de medida" value={unidadeMedida} onChange={(e) => setUnidadeMedida(e.target.value)} />{!produto && <Input label="Preço inicial" type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} required />}{erro && <p className="text-sm text-danger sm:col-span-2">{erro}</p>}<div className="flex gap-2 sm:col-span-2"><Button type="button" variante="secundaria" onClick={onCancelar} className="flex-1">Cancelar</Button><Button type="submit" disabled={enviando} className="flex-1">{enviando ? "Salvando..." : "Salvar corte"}</Button></div></form></Card>;
}



/** Bovinas → Suínas → Aves (ordem do balcão). */
function ordemCategoria(nome: string) {
  const n = nome.toLowerCase();
  if (n.includes("bovin")) return 0;
  if (n.includes("suín") || n.includes("suin")) return 1;
  if (n.includes("ave")) return 2;
  return 3;
}

function nomeCurtoCategoria(nome: string) {
  const n = nome.toLowerCase();
  if (n.includes("bovin")) return "Bovinas";
  if (n.includes("suín") || n.includes("suin")) return "Suínas";
  if (n.includes("ave")) return "Aves";
  return nome;
}

function SeletorCategoria({ categorias, valor, onMudar }: { categorias: Categoria[]; valor: string; onMudar: (id: string) => void }) {
  const id = useId();
  return <div className="flex flex-col gap-1.5"><label htmlFor={id} className="text-sm font-medium text-ink">Tipo de carne</label><select id={id} value={valor} onChange={(e) => onMudar(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm" required><option value="" disabled>Escolha o tipo</option>{categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}</select></div>;
}

/**
 * Alterar um corte: nome, código, tipo de carne e preço.
 * O preço vai por uma rota própria para ficar registrado no histórico de preços.
 */
function ModalAlterarProduto({ produto, categorias, onFechar, onSalvo }: { produto: Produto; categorias: Categoria[]; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(produto.nome);
  const [codigo, setCodigo] = useState(produto.codigo);
  const [categoriaId, setCategoriaId] = useState(produto.categoria?.id || "");
  const [preco, setPreco] = useState(String(Number(produto.preco)).replace(".", ","));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const unidade = produto.unidadeMedida || "kg";

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    const novoPreco = Number(preco.replace(",", "."));
    if (!nome.trim() || !codigo.trim()) return setErro("Preencha o nome e o código.");
    if (!categoriaId) return setErro("Escolha o tipo de carne.");
    if (!novoPreco || novoPreco <= 0) return setErro("Informe um preço maior que zero.");
    setSalvando(true);
    try {
      const dadosMudaram = nome.trim() !== produto.nome || codigo.trim() !== produto.codigo || categoriaId !== (produto.categoria?.id || "");
      if (dadosMudaram) {
        await api(`/produtos/${produto.id}`, { method: "PUT", body: { nome: nome.trim(), codigo: codigo.trim(), categoriaId } });
      }
      if (Math.abs(novoPreco - Number(produto.preco)) > 0.001) {
        await api(`/produtos/${produto.id}/preco`, { method: "PATCH", body: { preco: novoPreco } });
      }
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar as alterações.");
    } finally {
      setSalvando(false);
    }
  }

  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4" onClick={onFechar}>
    <div className="w-full max-w-lg rounded-card bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Alterar ${produto.nome}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="font-display text-2xl uppercase text-ink">Alterar corte</p><p className="text-sm text-muted">{produto.nome}</p></div><button type="button" onClick={onFechar} className="text-2xl text-muted" aria-label="Fechar">×</button></div>
      <form onSubmit={salvar} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Input label="Nome do corte" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus /></div>
        <Input label="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
        <SeletorCategoria categorias={categorias} valor={categoriaId} onMudar={setCategoriaId} />
        <div className="sm:col-span-2"><Input label={`Preço atual (R$ por ${unidade})`} inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} required /><p className="mt-1 text-xs text-muted">Mudança de preço vale para os próximos pedidos. Comandas já anotadas mantêm o preço da hora em que foram feitas.</p></div>
        {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2">{erro}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar alterações"}</Button></div>
      </form>
    </div>
  </div>;
}
