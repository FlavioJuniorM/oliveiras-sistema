import { FormEvent, useEffect, useState } from "react";
import { api, ErroApi } from "../../lib/api";
import { formatarData, formatarDataHora, formatarMoeda } from "../../lib/formatadores";
import { Cliente, HistoricoCliente } from "../../types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { IconeLapis, IconeLixeira } from "../../components/ui/Icones";

export function Clientes() {
  const [busca, setBusca] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteAberto, setClienteAberto] = useState<Cliente | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [clienteEdicao, setClienteEdicao] = useState<Cliente | null>(null);
  const [clienteExclusao, setClienteExclusao] = useState<Cliente | null>(null);
  const [aviso, setAviso] = useState("");

  async function carregar(termo = "") {
    setClientes(await api<Cliente[]>(`/clientes?busca=${encodeURIComponent(termo)}`));
  }

  useEffect(() => {
    const timeout = setTimeout(() => carregar(busca).catch(() => undefined), 300);
    return () => clearTimeout(timeout);
  }, [busca]);

  function atualizarCliente(atualizado: Cliente) {
    setClientes((atuais) => atuais.map((cliente) => (cliente.id === atualizado.id ? atualizado : cliente)));
    if (clienteAberto) setClienteAberto(atualizado);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-muted text-sm">{clientes.length} cliente(s) encontrado(s)</p></div>
        <Button onClick={() => setMostrarFormulario(true)}>Novo cliente</Button>
      </div>
      <Input placeholder="Buscar por nome, restaurante, CPF/CNPJ ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} className="sm:max-w-xl" />
      {mostrarFormulario && <FormularioCliente onCancelar={() => setMostrarFormulario(false)} onSalvo={(cliente) => { setMostrarFormulario(false); setClientes((atuais) => [cliente, ...atuais]); }} />}
      {clientes.length === 0 && <Card className="text-center py-12"><p className="font-display text-2xl uppercase text-ink">Nenhum cliente encontrado</p></Card>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clientes.map((cliente) => (
          <div key={cliente.id} className="flex flex-col bg-surface border border-border rounded-card shadow-card p-5 transition hover:border-primary/50">
            <div className="flex items-start justify-between gap-3"><div><p className="font-display text-xl uppercase tracking-wide text-ink">{cliente.nomeFantasia || cliente.razaoSocial || cliente.nome}</p><p className="text-xs text-muted mt-1">{cliente.tipo === "EMPRESA" ? "Restaurante / empresa" : cliente.tipo === "EVENTO" ? "Evento / festa" : "Pessoa física"}</p></div><StatusBadge status={cliente.status} /></div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4"><div><p className="text-xs text-muted">Documento</p><p className="text-sm font-medium text-ink mt-1">{cliente.documento || "Não informado"}</p></div><div><p className="text-xs text-muted">Telefone</p><p className="text-sm font-medium text-ink mt-1">{cliente.telefone || "Não informado"}</p></div><div className="col-span-2"><p className="text-xs text-muted">Local de entrega</p><p className="text-sm font-medium text-ink mt-1">{cliente.endereco || "Endereço ainda não cadastrado"}</p></div></div>
            <div className="mt-auto flex flex-col gap-2 pt-4">
              <Button className="w-full" onClick={() => setClienteAberto(cliente)}>Abrir ficha e histórico →</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variante="secundaria" className="flex-1" onClick={() => setClienteEdicao(cliente)}><IconeLapis tamanho={16} />Alterar</Button>
                <Button variante="secundaria" className="flex-1 !text-danger hover:!bg-danger/5" aria-label={`Excluir ${cliente.nomeFantasia || cliente.nome}`} onClick={() => setClienteExclusao(cliente)}><IconeLixeira tamanho={16} />Excluir</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {aviso && <p role="status" className="rounded-lg bg-success/10 px-4 py-3 text-sm font-semibold text-success">{aviso}</p>}
      {clienteEdicao && <div className="fixed inset-0 z-40 overflow-y-auto bg-black/50 px-3 py-5 sm:px-6" onClick={() => setClienteEdicao(null)}><div className="mx-auto max-w-4xl" onClick={(e) => e.stopPropagation()}><FormularioCliente cliente={clienteEdicao} onCancelar={() => setClienteEdicao(null)} onSalvo={(atualizado) => { atualizarCliente(atualizado); setClienteEdicao(null); setAviso(`Dados de ${atualizado.nomeFantasia || atualizado.nome} atualizados.`); }} /></div></div>}
      {clienteExclusao && <ModalExcluirCliente cliente={clienteExclusao} onFechar={() => setClienteExclusao(null)} onExcluido={(mensagem) => { setClientes((atuais) => atuais.filter((c) => c.id !== clienteExclusao.id)); setClienteExclusao(null); setAviso(mensagem); }} />}
      {clienteAberto && <ModalCliente cliente={clienteAberto} onFechar={() => setClienteAberto(null)} onAtualizado={atualizarCliente} />}
    </div>
  );
}

function FormularioCliente({ cliente, onCancelar, onSalvo }: { cliente?: Cliente; onCancelar: () => void; onSalvo: (cliente: Cliente) => void }) {
  const [nome, setNome] = useState(cliente?.nome || "");
  const [tipo, setTipo] = useState<Cliente["tipo"]>(cliente?.tipo || "PESSOA_FISICA");
  const [razaoSocial, setRazaoSocial] = useState(cliente?.razaoSocial || "");
  const [nomeFantasia, setNomeFantasia] = useState(cliente?.nomeFantasia || "");
  const [documento, setDocumento] = useState(cliente?.documento || "");
  const [telefone, setTelefone] = useState(cliente?.telefone || "");
  const [whatsapp, setWhatsapp] = useState(cliente?.whatsapp || "");
  const [email, setEmail] = useState(cliente?.email || "");
  const [endereco, setEndereco] = useState(cliente?.endereco || "");
  const [limiteCredito, setLimiteCredito] = useState(cliente?.limiteCredito == null ? "" : String(cliente.limiteCredito));
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault(); setErro(""); setEnviando(true);
    try {
      const vazio = (texto: string) => (cliente ? texto.trim() : texto.trim() || undefined); // ao editar, campo apagado fica vazio
      const dados = { nome, tipo, razaoSocial: vazio(razaoSocial), nomeFantasia: vazio(nomeFantasia), documento: vazio(documento), telefone: vazio(telefone), whatsapp: vazio(whatsapp), email: vazio(email), endereco: vazio(endereco), limiteCredito: limiteCredito ? Number(limiteCredito) : undefined };
      const salvo = await api<Cliente>(cliente ? `/clientes/${cliente.id}` : "/clientes", { method: cliente ? "PUT" : "POST", body: dados });
      onSalvo(salvo);
    } catch (e) { setErro(e instanceof ErroApi ? e.message : "Erro ao salvar cliente."); } finally { setEnviando(false); }
  }

  return <Card><div className="flex items-center justify-between mb-4"><div><p className="font-display text-2xl uppercase text-ink">{cliente ? "Editar cliente" : "Nova ficha"}</p><p className="text-sm text-muted">Dados usados nos pedidos e entregas.</p></div><button type="button" onClick={onCancelar} className="text-2xl text-muted">×</button></div><form onSubmit={aoEnviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Input label="Nome principal" value={nome} onChange={(e) => setNome(e.target.value)} required /><div className="flex flex-col gap-1.5"><label className="text-sm font-medium text-ink">Tipo</label><select value={tipo} onChange={(e) => setTipo(e.target.value as Cliente["tipo"])} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm"><option value="PESSOA_FISICA">Pessoa física</option><option value="EMPRESA">Restaurante / empresa</option><option value="EVENTO">Evento / festa</option></select></div><Input label="Razão social" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} /><Input label="Nome fantasia / restaurante" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} /><Input label="CPF/CNPJ" value={documento} onChange={(e) => setDocumento(e.target.value)} /><Input label="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} /><Input label="WhatsApp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /><Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /><Input label="Endereço / local de entrega" placeholder="Rua, número, bairro, cidade e complemento" value={endereco} onChange={(e) => setEndereco(e.target.value)} className="sm:col-span-2" /><Input label="Limite de crédito (R$)" type="number" value={limiteCredito} onChange={(e) => setLimiteCredito(e.target.value)} />{erro && <p className="text-sm text-danger sm:col-span-2">{erro}</p>}<div className="flex gap-2 sm:col-span-2"><Button type="button" variante="secundaria" onClick={onCancelar} className="flex-1">Cancelar</Button><Button type="submit" disabled={enviando} className="flex-1">{enviando ? "Salvando..." : "Salvar ficha"}</Button></div></form></Card>;
}

function ModalCliente({ cliente, onFechar, onAtualizado }: { cliente: Cliente; onFechar: () => void; onAtualizado: (cliente: Cliente) => void }) {
  const [aba, setAba] = useState<"dados" | "historico">("dados");
  const [historico, setHistorico] = useState<HistoricoCliente | null>(null);
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => { api<HistoricoCliente>(`/clientes/${cliente.id}/historico`).then(setHistorico).catch(() => setErro("Não foi possível carregar o histórico.")); }, [cliente.id]);

  if (editando) return <div className="fixed inset-0 z-40 overflow-y-auto bg-black/50 px-3 py-5 sm:px-6"><div className="mx-auto max-w-4xl"><FormularioCliente cliente={cliente} onCancelar={() => setEditando(false)} onSalvo={(atualizado) => { onAtualizado(atualizado); setEditando(false); }} /></div></div>;

  return <div className="fixed inset-0 z-40 overflow-y-auto bg-black/50 px-3 py-5 sm:px-6"><div className="mx-auto max-w-5xl rounded-card bg-surface shadow-2xl overflow-hidden"><div className="flex items-start justify-between bg-ink px-6 py-5 text-white"><div><p className="font-display text-3xl uppercase">{cliente.nomeFantasia || cliente.razaoSocial || cliente.nome}</p><p className="text-sm text-white/70 mt-1">Ficha do cliente · {cliente.documento || "sem documento"}</p></div><button type="button" onClick={onFechar} className="text-2xl text-white/70">×</button></div><div className="flex border-b border-border"><button type="button" onClick={() => setAba("dados")} className={`px-6 py-4 text-sm font-semibold ${aba === "dados" ? "border-b-2 border-primary text-primary" : "text-muted"}`}>Dados da ficha</button><button type="button" onClick={() => setAba("historico")} className={`px-6 py-4 text-sm font-semibold ${aba === "historico" ? "border-b-2 border-primary text-primary" : "text-muted"}`}>Histórico de pedidos</button></div><div className="p-6">{aba === "dados" ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Info label="Nome" valor={cliente.nome} /><Info label="Restaurante / nome fantasia" valor={cliente.nomeFantasia} /><Info label="Telefone" valor={cliente.telefone} /><Info label="WhatsApp" valor={cliente.whatsapp} /><Info label="Documento" valor={cliente.documento} /><Info label="Endereço" valor={cliente.endereco} /><Info label="Limite de crédito" valor={cliente.limiteCredito == null ? "Não informado" : formatarMoeda(cliente.limiteCredito)} /><div className="sm:col-span-2 mt-3"><Button onClick={() => setEditando(true)}>Editar dados da ficha</Button></div></div> : <>{erro && <p className="text-danger text-sm">{erro}</p>}{!historico ? <p className="text-muted text-sm">Carregando histórico...</p> : <><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Resumo titulo="Total comprado" valor={formatarMoeda(historico.totalComprado)} /><Resumo titulo="Total pago" valor={formatarMoeda(historico.totalPago)} /><Resumo titulo="Em aberto" valor={formatarMoeda(historico.totalEmAberto)} /><Resumo titulo="Última compra" valor={historico.ultimaCompra ? formatarData(historico.ultimaCompra) : "Nenhuma"} /></div><div className="mt-6 space-y-3">{historico.pedidos.length === 0 && <p className="text-muted text-sm">Nenhum pedido para este cliente.</p>}{historico.pedidos.map((pedido) => <div key={pedido.id} className="rounded-lg border border-border bg-background p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-ink">Comanda {pedido.numero}</p><p className="text-xs text-muted mt-1">{formatarDataHora(pedido.criadoEm)}</p></div><div className="flex items-center gap-2"><StatusBadge status={pedido.statusOperacao || "RECEBIDO"} /><p className="font-semibold text-ink">{formatarMoeda(pedido.total)}</p></div></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">{pedido.itens.map((item) => <span key={item.id}>{item.produto?.nome || "Produto"} · {Number(item.pesoReal ?? item.pesoOuQtd).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</span>)}</div></div>)}</div></>}</>}</div></div></div>;
}

function Info({ label, valor }: { label: string; valor?: string | null }) { return <div><p className="text-xs text-muted">{label}</p><p className="font-medium text-ink mt-1">{valor || "Não informado"}</p></div>; }
function Resumo({ titulo, valor }: { titulo: string; valor: string }) { return <div className="rounded-lg bg-background p-3"><p className="text-xs text-muted">{titulo}</p><p className="font-semibold text-ink mt-1">{valor}</p></div>; }

function ModalExcluirCliente({ cliente, onFechar, onExcluido }: { cliente: Cliente; onFechar: () => void; onExcluido: (mensagem: string) => void }) {
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const nome = cliente.nomeFantasia || cliente.razaoSocial || cliente.nome;

  async function excluir() {
    setErro(""); setExcluindo(true);
    try {
      const r = await api<{ excluido: boolean; inativado: boolean; comandas: number }>(`/clientes/${cliente.id}`, { method: "DELETE" });
      onExcluido(r.inativado ? `${nome} saiu da lista de clientes. As ${r.comandas} comanda(s) dele continuam no histórico.` : `${nome} foi excluído.`);
    } catch (e) { setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir o cliente."); setExcluindo(false); }
  }

  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:px-4" onClick={onFechar}><div role="dialog" aria-modal="true" aria-label="Excluir cliente" className="w-full max-w-lg rounded-t-card bg-surface p-6 shadow-2xl sm:rounded-card" onClick={(e) => e.stopPropagation()}>
    <p className="font-display text-2xl uppercase text-ink">Excluir cliente?</p>
    <div className="mt-4 rounded-lg bg-background p-4 text-sm"><p className="font-semibold text-ink">{nome}</p><p className="text-muted">{[cliente.telefone, cliente.documento].filter(Boolean).join(" · ") || "Sem telefone ou documento"}</p></div>
    <p className="mt-4 text-sm text-ink">O cliente sai da lista e da busca do Novo Pedido. Se ele já tiver comandas, o histórico dessas comandas continua guardado (não some do financeiro).</p>
    {erro && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variante="secundaria" onClick={onFechar}>Não, manter</Button><Button variante="perigo" disabled={excluindo} onClick={excluir}><IconeLixeira tamanho={16} />{excluindo ? "Excluindo..." : "Sim, excluir"}</Button></div>
  </div></div>;
}
