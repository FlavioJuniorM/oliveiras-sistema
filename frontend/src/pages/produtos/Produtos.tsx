import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { formatarMoeda } from "../../lib/formatadores";
import { Produto } from "../../types";
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
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [produtoPreco, setProdutoPreco] = useState<Produto | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    try { setProdutos(await api<Produto[]>(ehAdmin ? "/produtos?todos=true" : "/produtos")); setErro(""); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao carregar carnes."); }
  }
  useEffect(() => { carregar(); }, [ehAdmin]);

  const visiveis = useMemo(() => produtos.filter((produto) => {
    const texto = `${produto.nome} ${produto.codigo} ${produto.categoria?.nome || ""}`.toLowerCase();
    return texto.includes(busca.toLowerCase()) && (filtroStatus === "TODOS" || produto.status === filtroStatus);
  }), [produtos, busca, filtroStatus]);

  async function excluir(produto: Produto) {
    if (!window.confirm(`Excluir ${produto.nome}? Produtos usados em pedidos serão apenas inativados.`)) return;
    try { await api(`/produtos/${produto.id}`, { method: "DELETE" }); await carregar(); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao excluir produto."); }
  }

  return <div className="flex flex-col gap-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-muted text-sm">{visiveis.length} produto(s) visível(is)</p><h2 className="font-display text-3xl uppercase tracking-wide text-ink mt-1">Cortes e carnes</h2></div>{ehAdmin && <Button onClick={() => setMostrarFormulario(true)}>Novo corte</Button>}</div><div className="flex flex-col gap-3 sm:flex-row"><Input placeholder="Pesquisar por nome, código ou categoria..." value={busca} onChange={(e) => setBusca(e.target.value)} className="sm:flex-1" /><select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="TODOS">Todos os status</option><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option></select></div>{erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}{mostrarFormulario && <FormularioProduto onCancelar={() => setMostrarFormulario(false)} onSalvo={(produto) => { setMostrarFormulario(false); setProdutos((atuais) => [produto, ...atuais]); }} />}{visiveis.length === 0 && <Card className="text-center py-12"><p className="font-display text-2xl uppercase text-ink">Nenhuma carne encontrada</p></Card>}<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{visiveis.map((produto) => <Card key={produto.id} className={produto.status === "INATIVO" ? "opacity-60" : ""}><div className="flex items-start justify-between gap-3"><div><p className="font-display text-xl uppercase tracking-wide text-ink">{produto.nome}</p><p className="text-xs text-muted mt-1">Código {produto.codigo}{produto.categoria ? ` · ${produto.categoria.nome}` : ""}</p></div><StatusBadge status={produto.status} /></div><div className="mt-5 flex items-end justify-between border-t border-border pt-4"><div><p className="text-xs text-muted">Preço atual</p><p className="font-display text-2xl text-gold mt-1">{formatarMoeda(produto.preco)}<span className="text-sm text-muted">/{produto.unidadeMedida}</span></p></div><p className="text-xs text-muted">{produto.tipoVenda === "PESO" ? "Peso variável" : produto.tipoVenda === "UNIDADE" ? "Por unidade" : "Pacote"}</p></div>{ehAdmin && <div className="mt-4 flex flex-wrap gap-2"><Button variante="secundaria" tamanho="padrao" onClick={() => setProdutoEditando(produto)}>Editar</Button><Button variante="secundaria" tamanho="padrao" onClick={() => setProdutoPreco(produto)}>Preço</Button><Button variante="perigo" tamanho="padrao" onClick={() => excluir(produto)}>Excluir</Button></div>}</Card>)}</div>{produtoEditando && <FormularioProduto produto={produtoEditando} onCancelar={() => setProdutoEditando(null)} onSalvo={(produto) => { setProdutoEditando(null); setProdutos((atuais) => atuais.map((item) => item.id === produto.id ? produto : item)); }} />}{produtoPreco && <ModalPreco produto={produtoPreco} onFechar={() => setProdutoPreco(null)} onAtualizado={carregar} />}</div>;
}

function FormularioProduto({ produto, onCancelar, onSalvo }: { produto?: Produto; onCancelar: () => void; onSalvo: (produto: Produto) => void }) {
  const [codigo, setCodigo] = useState(produto?.codigo || "");
  const [nome, setNome] = useState(produto?.nome || "");
  const [preco, setPreco] = useState(produto ? String(produto.preco) : "");
  const [tipoVenda, setTipoVenda] = useState<Produto["tipoVenda"]>(produto?.tipoVenda || "PESO");
  const [unidadeMedida, setUnidadeMedida] = useState(produto?.unidadeMedida || "kg");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) { evento.preventDefault(); setErro(""); setEnviando(true); try { const salvo = await api<Produto>(produto ? `/produtos/${produto.id}` : "/produtos", { method: produto ? "PUT" : "POST", body: produto ? { codigo, nome, tipoVenda, unidadeMedida } : { codigo, nome, preco: Number(preco), tipoVenda, unidadeMedida } }); onSalvo(salvo); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao salvar produto."); } finally { setEnviando(false); } }
  return <Card><div className="flex items-center justify-between mb-4"><div><p className="font-display text-2xl uppercase text-ink">{produto ? "Editar corte" : "Novo corte"}</p><p className="text-sm text-muted">O preço tem edição separada para manter o histórico.</p></div><button type="button" onClick={onCancelar} className="text-2xl text-muted">×</button></div><form onSubmit={aoEnviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Input label="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} required /><Input label="Nome do corte" value={nome} onChange={(e) => setNome(e.target.value)} required /><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Tipo de venda</label><select value={tipoVenda} onChange={(e) => setTipoVenda(e.target.value as Produto["tipoVenda"])} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="PESO">Peso variável</option><option value="UNIDADE">Unidade</option><option value="PACOTE_FIXO">Pacote fixo</option></select></div><Input label="Unidade de medida" value={unidadeMedida} onChange={(e) => setUnidadeMedida(e.target.value)} />{!produto && <Input label="Preço inicial" type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} required />}{erro && <p className="text-sm text-danger sm:col-span-2">{erro}</p>}<div className="flex gap-2 sm:col-span-2"><Button type="button" variante="secundaria" onClick={onCancelar} className="flex-1">Cancelar</Button><Button type="submit" disabled={enviando} className="flex-1">{enviando ? "Salvando..." : "Salvar corte"}</Button></div></form></Card>;
}

function ModalPreco({ produto, onFechar, onAtualizado }: { produto: Produto; onFechar: () => void; onAtualizado: () => void }) { const [preco, setPreco] = useState(String(produto.preco)); const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false); async function salvar() { setEnviando(true); try { await api(`/produtos/${produto.id}/preco`, { method: "PATCH", body: { preco: Number(preco) } }); onAtualizado(); onFechar(); } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao alterar preço."); } finally { setEnviando(false); } } return <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4"><Card className="w-full max-w-sm"><p className="font-semibold text-ink">Alterar preço · {produto.nome}</p><p className="text-xs text-muted mt-1">Atual: {formatarMoeda(produto.preco)}</p><Input label="Novo preço" type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} className="mt-4" />{erro && <p className="text-sm text-danger mt-2">{erro}</p>}<div className="flex gap-2 mt-4"><Button variante="secundaria" className="flex-1" onClick={onFechar}>Cancelar</Button><Button className="flex-1" disabled={enviando} onClick={salvar}>{enviando ? "Salvando..." : "Salvar"}</Button></div></Card></div>; }
