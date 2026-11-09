import { FormEvent, useEffect, useMemo, useState } from "react";
import { AvisoDuplicidade, useDuplicidade } from "../../components/ui/Duplicidade";
import { api, ErroApi } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { IconeLapis, IconeLixeira, IconeMais } from "../../components/ui/Icones";
import { CamposFornecedor, dadosVazios, normalizar, type DadosFornecedor, type Fornecedor } from "../../components/fornecedores/fornecedores";

function linkWhatsApp(telefone: string) {
  const numeros = telefone.replace(/\D/g, "");
  if (numeros.length < 10) return null;
  return `https://wa.me/${numeros.startsWith("55") ? numeros : `55${numeros}`}`;
}

export function Fornecedores() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [edicao, setEdicao] = useState<{ fornecedor?: Fornecedor } | null>(null);
  const [exclusao, setExclusao] = useState<Fornecedor | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      setFornecedores(await api<Fornecedor[]>("/fornecedores?todos=1"));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar os fornecedores.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return fornecedores;
    return fornecedores.filter((f) => normalizar(`${f.nome} ${f.contato ?? ""} ${f.documento ?? ""} ${f.telefone ?? ""} ${f.categoriaPadrao}`).includes(termo));
  }, [busca, fornecedores]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted">
          Fornecedores usados no dia a dia. Ao lançar uma conta a pagar, os dados são puxados daqui.
        </p>
        <Button tamanho="grande" onClick={() => setEdicao({})}>
          <IconeMais tamanho={20} />
          Novo fornecedor
        </Button>
      </div>

      <Card>
        <Input aria-label="Buscar fornecedor" placeholder="Buscar por nome, contato, CNPJ ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </Card>

      {erro && <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}
      {carregando && <Card><p className="text-sm text-muted">Carregando...</p></Card>}

      {!carregando && visiveis.length === 0 && (
        <Card className="py-10 text-center">
          <p className="font-semibold text-ink">{busca ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado ainda."}</p>
          <p className="mt-1 text-sm text-muted">Cadastre os fornecedores que vocês usam para lançar contas mais rápido.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visiveis.map((f) => {
          const whatsapp = f.telefone ? linkWhatsApp(f.telefone) : null;
          return (
            <Card key={f.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words font-display text-xl uppercase text-ink">{f.nome}</p>
                <span className="shrink-0 rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted">{f.categoriaPadrao}</span>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-1.5 text-sm">
                {f.telefone && (
                  <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Telefone</dt><dd className="text-ink">{whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer" className="font-semibold text-success underline-offset-2 hover:underline">{f.telefone}</a> : f.telefone}</dd></div>
                )}
                {f.contato && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Contato</dt><dd className="text-ink">{f.contato}</dd></div>}
                {f.documento && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">CNPJ/CPF</dt><dd className="text-ink">{f.documento}</dd></div>}
                {!f.telefone && !f.contato && !f.documento && <p className="text-muted">Sem telefone ou documento — clique em Alterar para completar.</p>}
              </dl>
              {f.observacoes && <p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs text-ink">{f.observacoes}</p>}
              <div className="mt-auto pt-4">
                <p className="mb-3 text-xs text-muted">{f.quantidadeContas ? `${f.quantidadeContas} conta(s) lançada(s) em Contas a Pagar` : "Nenhuma conta lançada ainda"}</p>
                <div className="flex gap-2">
                  <Button variante="secundaria" className="flex-1" onClick={() => setEdicao({ fornecedor: f })}><IconeLapis tamanho={16} />Alterar</Button>
                  <Button variante="secundaria" className="flex-1 !text-danger hover:!bg-danger/5" onClick={() => setExclusao(f)}><IconeLixeira tamanho={16} />Excluir</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {edicao && (
        <ModalFornecedor
          fornecedor={edicao.fornecedor}
          onFechar={() => setEdicao(null)}
          onSalvo={() => { setEdicao(null); carregar(); }}
        />
      )}
      {exclusao && (
        <ModalExcluir
          fornecedor={exclusao}
          onFechar={() => setExclusao(null)}
          onExcluido={() => { setFornecedores((atuais) => atuais.filter((f) => f.id !== exclusao.id)); setExclusao(null); }}
        />
      )}
    </div>
  );
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:px-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-card bg-surface p-5 shadow-2xl sm:rounded-card sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-2xl uppercase text-ink">{titulo}</p>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 shrink-0 text-2xl text-muted">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFornecedor({ fornecedor, onFechar, onSalvo }: { fornecedor?: Fornecedor; onFechar: () => void; onSalvo: () => void }) {
  const [dados, setDados] = useState<DadosFornecedor>(
    fornecedor
      ? { nome: fornecedor.nome, documento: fornecedor.documento ?? "", telefone: fornecedor.telefone ?? "", contato: fornecedor.contato ?? "", categoriaPadrao: fornecedor.categoriaPadrao, observacoes: fornecedor.observacoes ?? "" }
      : dadosVazios()
  );
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const renomeando = fornecedor && dados.nome.trim() !== fornecedor.nome;
  const duplicidade = useDuplicidade("/fornecedores/duplicados", { nome: dados.nome, documento: dados.documento, ignorarId: fornecedor?.id });

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await api(fornecedor ? `/fornecedores/${fornecedor.id}` : "/fornecedores", { method: fornecedor ? "PUT" : "POST", body: dados });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível salvar o fornecedor.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={fornecedor ? "Alterar fornecedor" : "Novo fornecedor"} onFechar={onFechar}>
      <form onSubmit={salvar} className="mt-4 flex flex-col gap-4">
        <CamposFornecedor dados={dados} onMudar={setDados} />
        <p className="text-xs text-muted">O tipo de conta escolhido aqui já vem marcado quando você lança uma conta deste fornecedor.</p>
        {renomeando && !!fornecedor.quantidadeContas && (
          <p className="rounded-lg bg-gold/15 px-3 py-2 text-sm text-ink">As {fornecedor.quantidadeContas} conta(s) lançada(s) como “{fornecedor.nome}” passam a aparecer com o nome novo.</p>
        )}
        <AvisoDuplicidade resultado={duplicidade} tipo={fornecedor ? "outro fornecedor" : "este fornecedor"} />
        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" tamanho="grande" disabled={salvando || duplicidade.bloqueio.length > 0}>{salvando ? "Salvando..." : fornecedor ? "Salvar alterações" : "Cadastrar fornecedor"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ModalExcluir({ fornecedor, onFechar, onExcluido }: { fornecedor: Fornecedor; onFechar: () => void; onExcluido: () => void }) {
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    setErro("");
    setExcluindo(true);
    try {
      await api(`/fornecedores/${fornecedor.id}`, { method: "DELETE" });
      onExcluido();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir.");
      setExcluindo(false);
    }
  }

  return (
    <Modal titulo="Excluir fornecedor?" onFechar={onFechar}>
      <p className="mt-4 font-semibold text-ink">{fornecedor.nome}</p>
      <p className="mt-2 text-sm text-ink">O cadastro será apagado.{fornecedor.quantidadeContas ? ` As ${fornecedor.quantidadeContas} conta(s) já lançada(s) continuam em Contas a Pagar, com o mesmo nome.` : ""}</p>
      {erro && <p role="alert" className="mt-3 text-sm text-danger">{erro}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variante="secundaria" onClick={onFechar}>Não, manter</Button>
        <Button type="button" variante="perigo" disabled={excluindo} onClick={excluir}><IconeLixeira tamanho={16} />{excluindo ? "Excluindo..." : "Sim, excluir"}</Button>
      </div>
    </Modal>
  );
}
