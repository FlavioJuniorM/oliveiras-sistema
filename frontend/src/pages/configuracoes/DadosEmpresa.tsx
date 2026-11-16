import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Card, CardSubtitulo, CardTitulo } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

/**
 * Dados cadastrais da empresa (Receita Federal, consulta pública) e QR Code Pix da chave CNPJ.
 */
export const EMPRESA = {
  razaoSocial: "CASA DE CARNES OLIVEIRA'S II LTDA",
  nomeFantasia: "CASA DE CARNES OLIVEIRA'S II",
  cnpj: "30.433.998/0001-89",
  situacao: "Ativa",
  abertura: "11/05/2018",
  porte: "Microempresa (ME)",
  naturezaJuridica: "Sociedade Empresária Limitada",
  capitalSocial: "R$ 100.000,00",
  atividade: "Comércio varejista de carnes (açougue)",
  endereco: "Rua Água Marinha, 185 — Mutinga",
  cidade: "Osasco — SP",
  cep: "06280-000",
  email: "carnesoliveiras2@gmail.com",
  consultadoEm: "15/11/2026",
};

const CHAVE_PIX = EMPRESA.cnpj.replace(/\D/g, ""); // chave Pix = CNPJ (só números)
const NOME_PIX = "CASA DE CARNES OLIVEIRAS"; // até 25 letras, sem acento
const CIDADE_PIX = "OSASCO";

// ───────────── Pix "copia e cola" (BR Code estático, padrão do Banco Central) ─────────────

function campo(id: string, valor: string) {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

function crc16(texto: string) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Código Pix sem valor fixo: quem paga digita o valor no app do banco. */
export function pixCopiaECola() {
  const conta = campo("00", "BR.GOV.BCB.PIX") + campo("01", CHAVE_PIX);
  const corpo =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("58", "BR") +
    campo("59", NOME_PIX) +
    campo("60", CIDADE_PIX) +
    campo("62", campo("05", "***")) +
    "6304";
  return corpo + crc16(corpo);
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // navegador sem permissão: usa o jeito antigo
    const area = document.createElement("textarea");
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function DadosEmpresa() {
  const [aberto, setAberto] = useState(false);
  const [svg, setSvg] = useState("");
  const [copiado, setCopiado] = useState("");
  const codigo = pixCopiaECola();

  useEffect(() => {
    if (!aberto || svg) return;
    QRCode.toString(codigo, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } }).then(setSvg);
  }, [aberto, svg, codigo]);

  async function copiarTexto(texto: string, qual: string) {
    if (await copiar(texto)) {
      setCopiado(qual);
      setTimeout(() => setCopiado(""), 2500);
    }
  }

  async function baixarQr() {
    const url = await QRCode.toDataURL(codigo, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
    const a = document.createElement("a");
    a.href = url;
    a.download = "pix-casa-de-carnes-oliveiras.png";
    a.click();
  }

  const linhas: [string, string][] = [
    ["Razão social", EMPRESA.razaoSocial],
    ["Nome fantasia", EMPRESA.nomeFantasia],
    ["CNPJ", EMPRESA.cnpj],
    ["Situação cadastral", EMPRESA.situacao],
    ["Data de abertura", EMPRESA.abertura],
    ["Porte", EMPRESA.porte],
    ["Natureza jurídica", EMPRESA.naturezaJuridica],
    ["Capital social", EMPRESA.capitalSocial],
    ["Atividade principal", EMPRESA.atividade],
    ["Endereço", `${EMPRESA.endereco}, ${EMPRESA.cidade}`],
    ["CEP", EMPRESA.cep],
    ["E-mail", EMPRESA.email],
  ];

  return (
    <Card className="mb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitulo>Dados da empresa</CardTitulo>
          <CardSubtitulo className="mt-1">CNPJ, endereço e QR Code do Pix da loja.</CardSubtitulo>
        </div>
        <Button variante={aberto ? "secundaria" : "primaria"} onClick={() => setAberto(!aberto)} className="whitespace-nowrap">
          {aberto ? "Fechar" : "Ver dados da empresa"}
        </Button>
      </div>

      {aberto && (
        <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
          <div className="flex flex-col items-center rounded-card border border-border bg-white p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pix — chave CNPJ</p>
            <div
              className="mt-3 aspect-square w-full max-w-[220px] [&>svg]:h-full [&>svg]:w-full"
              role="img"
              aria-label="QR Code do Pix da Casa de Carnes Oliveiras"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="mt-3 font-display text-lg tracking-wide text-ink">{EMPRESA.cnpj}</p>
            <p className="text-xs text-muted">{NOME_PIX} · {CIDADE_PIX}</p>
            <div className="mt-4 grid w-full gap-2">
              <Button variante="secundaria" onClick={() => copiarTexto(CHAVE_PIX, "chave")}>{copiado === "chave" ? "Chave copiada" : "Copiar chave Pix"}</Button>
              <Button variante="secundaria" onClick={() => copiarTexto(codigo, "codigo")}>{copiado === "codigo" ? "Código copiado" : "Copiar Pix copia e cola"}</Button>
              <Button variante="fantasma" onClick={baixarQr}>Baixar QR Code (imagem)</Button>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-muted">QR sem valor: o cliente digita o valor no app do banco. Confira o nome do recebedor antes de confirmar.</p>
          </div>

          <div className="min-w-0">
            <dl className="divide-y divide-border rounded-card border border-border">
              {linhas.map(([rotulo, valor]) => (
                <div key={rotulo} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[170px_1fr] sm:gap-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted sm:pt-0.5">{rotulo}</dt>
                  <dd className="break-words text-sm font-semibold text-ink">
                    {rotulo === "Situação cadastral" ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">{valor}</span> : valor}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted">Dados públicos do CNPJ consultados em {EMPRESA.consultadoEm}. Para atualizar a situação na Receita Federal, consulte o comprovante oficial do CNPJ.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
