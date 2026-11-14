import { useEffect, useRef, useState } from "react";
import { ErroApi } from "../../lib/api";

/**
 * Comprovantes e recibos assinados (foto ou PDF) guardados junto das contas a pagar.
 * Funciona no celular (câmera ou galeria) e no computador (escolher arquivo).
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";
const token = () => localStorage.getItem("oliveiras_token");
const TAMANHO_MAXIMO = 4 * 1024 * 1024;

export type TipoAnexo = "COMPROVANTE" | "RECIBO_ASSINADO";

export interface Anexo {
  id: string;
  tipo: TipoAnexo;
  nome: string;
  tipoMime: string;
  tamanho: number;
  criadoEm: string;
}

const ehPdf = (f: { type?: string; tipoMime?: string; name?: string; nome?: string }) =>
  (f.type ?? f.tipoMime) === "application/pdf" || /\.pdf$/i.test(f.name ?? f.nome ?? "");

/** Reduz fotos (as do celular passam de 5 MB) para ~1.800 px em JPEG. PDF vai como está. */
async function prepararArquivo(arquivo: File): Promise<Blob> {
  if (ehPdf(arquivo)) {
    if (arquivo.size > TAMANHO_MAXIMO) throw new ErroApi("O PDF passa de 4 MB. Envie um arquivo menor ou uma foto.", 400);
    return arquivo;
  }
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sem canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    if (blob) return blob;
  } catch {
    // formato que o navegador não abre (ex.: HEIC no computador): envia o original
  }
  if (arquivo.size > TAMANHO_MAXIMO) throw new ErroApi("A foto passa de 4 MB. Tire a foto de novo ou envie em JPG.", 400);
  return arquivo;
}

export async function enviarAnexo(contaPagarId: string, tipo: TipoAnexo, arquivo: File): Promise<Anexo> {
  const corpo = await prepararArquivo(arquivo);
  const nome = ehPdf(arquivo) ? arquivo.name : arquivo.name.replace(/\.[^.]+$/, "") + ".jpg";
  const resposta = await fetch(`${BASE_URL}/anexos?contaPagarId=${encodeURIComponent(contaPagarId)}&tipo=${tipo}`, {
    method: "POST",
    headers: {
      "Content-Type": corpo.type || "application/octet-stream",
      "X-Nome-Arquivo": encodeURIComponent(nome || "arquivo"),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: corpo,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroApi(dados.erro || (resposta.status === 413 ? "Arquivo grande demais (máx. 4 MB)." : "Não foi possível enviar o arquivo."), resposta.status);
  return dados as Anexo;
}

export async function excluirAnexo(id: string) {
  const resposta = await fetch(`${BASE_URL}/anexos/${id}`, { method: "DELETE", headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => ({}));
    throw new ErroApi(dados.erro || "Não foi possível excluir o arquivo.", resposta.status);
  }
}

async function baixarAnexo(id: string) {
  const resposta = await fetch(`${BASE_URL}/anexos/${id}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
  if (!resposta.ok) throw new ErroApi("Não foi possível abrir o arquivo.", resposta.status);
  return resposta.blob();
}

// ───────────── Escolher arquivo (câmera, galeria ou computador) ─────────────

export function CampoArquivo({
  arquivo,
  onChange,
  rotulo = "Comprovante (opcional)",
  dica = "Foto do comprovante ou PDF do banco",
}: {
  arquivo: File | null;
  onChange: (f: File | null) => void;
  rotulo?: string;
  dica?: string;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const arquivos = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);

  useEffect(() => {
    if (!arquivo || ehPdf(arquivo)) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onChange(f);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{rotulo}</span>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolher} />
      <input ref={arquivos} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={escolher} />
      {arquivo ? (
        <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/[0.06] p-2.5">
          {previa ? (
            <img src={previa} alt="Prévia do arquivo" className="h-14 w-14 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-danger">PDF</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{arquivo.name || "foto.jpg"}</p>
            <p className="text-xs text-muted">{(arquivo.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB · pronto para enviar</p>
          </div>
          <button type="button" onClick={() => onChange(null)} className="h-9 shrink-0 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-danger/5">Trocar</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => camera.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-ink/30 bg-white px-3 text-sm font-semibold text-ink hover:bg-background">
            📷 Tirar foto
          </button>
          <button type="button" onClick={() => arquivos.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-ink/30 bg-white px-3 text-sm font-semibold text-ink hover:bg-background">
            📎 Foto ou PDF
          </button>
        </div>
      )}
      <span className="text-xs text-muted">{dica} · até 4 MB</span>
    </div>
  );
}

// ───────────── Ver e listar arquivos ─────────────

export function VisualizarAnexo({ anexo, onFechar }: { anexo: Anexo; onFechar: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let atual: string | null = null;
    baixarAnexo(anexo.id)
      .then((blob) => {
        atual = URL.createObjectURL(blob);
        setUrl(atual);
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível abrir."));
    return () => {
      if (atual) URL.revokeObjectURL(atual);
    };
  }, [anexo.id]);

  const pdf = ehPdf(anexo);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" onClick={onFechar}>
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-card bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{anexo.nome}</p>
            <p className="text-xs text-muted">{anexo.tipo === "RECIBO_ASSINADO" ? "Recibo assinado" : "Comprovante de pagamento"} · enviado em {new Date(anexo.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {url && (
              <a href={url} download={anexo.nome} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-ink hover:bg-background">
                Baixar
              </a>
            )}
            <button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 text-2xl text-muted">×</button>
          </div>
        </div>
        <div className="flex min-h-[50vh] flex-1 items-center justify-center overflow-auto bg-background">
          {erro && <p className="p-6 text-sm text-danger">{erro}</p>}
          {!erro && !url && <p className="p-6 text-sm text-muted">Carregando...</p>}
          {url && !pdf && <img src={url} alt={anexo.nome} className="max-h-[80vh] w-auto max-w-full object-contain" />}
          {url && pdf && (
            <div className="flex h-[80vh] w-full flex-col">
              <object data={url} type="application/pdf" className="h-full w-full">
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-muted">Seu aparelho não mostra o PDF aqui dentro.</p>
                  <a href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white">Abrir o PDF</a>
                </div>
              </object>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Botõezinhos dos arquivos de uma conta: tocar abre, lixeira exclui. */
export function ListaAnexos({ anexos, onExcluido }: { anexos: Anexo[]; onExcluido?: (id: string) => void }) {
  const [vendo, setVendo] = useState<Anexo | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  if (anexos.length === 0) return null;

  async function excluir(a: Anexo) {
    if (!window.confirm(`Excluir o arquivo "${a.nome}"?`)) return;
    setExcluindo(a.id);
    try {
      await excluirAnexo(a.id);
      onExcluido?.(a.id);
    } catch (e) {
      window.alert(e instanceof ErroApi ? e.message : "Não foi possível excluir.");
    } finally {
      setExcluindo(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {anexos.map((a) => (
          <span key={a.id} className="inline-flex max-w-full items-center overflow-hidden rounded-full border border-border bg-white text-xs">
            <button type="button" onClick={() => setVendo(a)} className="flex min-w-0 items-center gap-1 py-1 pl-2.5 pr-2 font-semibold text-primary hover:bg-primary/5" title={a.nome}>
              <span aria-hidden>{ehPdf(a) ? "📄" : "🖼️"}</span>
              <span className="truncate">{a.tipo === "RECIBO_ASSINADO" ? "Recibo assinado" : "Comprovante"}</span>
            </button>
            {onExcluido && (
              <button type="button" onClick={() => excluir(a)} disabled={excluindo === a.id} aria-label={`Excluir ${a.nome}`} className="border-l border-border px-2 py-1 text-muted hover:bg-danger/5 hover:text-danger disabled:opacity-40">
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {vendo && <VisualizarAnexo anexo={vendo} onFechar={() => setVendo(null)} />}
    </>
  );
}

/** Botão "anexar" direto (sem formulário): escolhe o arquivo e já envia. */
export function BotaoAnexar({
  contaPagarId,
  tipo,
  rotulo,
  onEnviado,
  className = "",
}: {
  contaPagarId: string;
  tipo: TipoAnexo;
  rotulo: string;
  onEnviado: (a: Anexo) => void;
  className?: string;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    setErro("");
    try {
      const a = await enviarAnexo(contaPagarId, tipo, arquivo);
      onEnviado(a);
      setArquivo(null);
      setAberto(false);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={`inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5 ${className}`}>
        📎 {rotulo}
      </button>
    );
  }
  return (
    <div className={`w-full rounded-lg border border-border bg-background p-3 ${className}`}>
      <CampoArquivo arquivo={arquivo} onChange={setArquivo} rotulo={rotulo} dica={tipo === "RECIBO_ASSINADO" ? "Foto do recibo assinado pelo funcionário" : "Foto do comprovante ou PDF do banco"} />
      {erro && <p className="mt-2 text-sm text-danger">{erro}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => { setAberto(false); setArquivo(null); setErro(""); }} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-white">Cancelar</button>
        <button type="button" onClick={enviar} disabled={!arquivo || enviando} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{enviando ? "Enviando..." : "Salvar arquivo"}</button>
      </div>
    </div>
  );
}
