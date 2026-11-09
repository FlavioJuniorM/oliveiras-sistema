import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Gráficos leves em SVG/HTML (sem biblioteca externa), no padrão visual da Oliveiras.
 * Regras: marcas finas, eixos discretos, legenda sempre que houver 2+ séries,
 * dica (tooltip) ao passar o dedo/mouse, cores fixas por série.
 */

// Paleta categórica validada (contraste ≥ 3:1 e separação para daltonismo), em ordem fixa
export const CORES_CATEGORIAS = ["#A3162E", "#2B6CB0", "#B07D0E", "#2F855A", "#6B46C1", "#B8527A"];
export const COR_ENTRADA = "#2F855A";
export const COR_SAIDA = "#A3162E";
export const COR_PRINCIPAL = "#A3162E";

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setLargura(ref.current.clientWidth);
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    observador.observe(ref.current);
    return () => observador.disconnect();
  }, []);
  return [ref, largura] as const;
}

/** Escala "bonita" para o eixo: 0 até um teto arredondado, com 4 divisões. */
function escala(maximo: number) {
  if (maximo <= 0) return { teto: 1, marcas: [0, 0.25, 0.5, 0.75, 1] };
  const bruto = maximo / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  const teto = passo * 4;
  return { teto, marcas: [0, passo, passo * 2, passo * 3, teto] };
}

export function moedaCompacta(valor: number) {
  const abs = Math.abs(valor);
  const sinal = valor < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `${sinal}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sinal}R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

export function Legenda({ itens }: { itens: { rotulo: string; cor: string; valor?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {itens.map((item) => (
        <span key={item.rotulo} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.cor }} aria-hidden />
          <span className="text-ink">{item.rotulo}</span>
          {item.valor && <span className="font-semibold text-ink">{item.valor}</span>}
        </span>
      ))}
    </div>
  );
}

function Dica({ x, y, largura, children }: { x: number; y: number; largura: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(160);
  useEffect(() => {
    if (ref.current) setW(ref.current.offsetWidth);
  });
  const esquerda = Math.min(Math.max(x - w / 2, 0), Math.max(largura - w, 0));
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-10 rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left: esquerda, top: Math.max(y - 8, 0), transform: "translateY(-100%)" }}
    >
      {children}
    </div>
  );
}

// ───────────────────────── Linhas (série temporal) ─────────────────────────

interface SerieLinha {
  nome: string;
  cor: string;
  valores: number[];
}

export function GraficoLinhas({
  rotulos,
  rotulosLongos,
  series,
  formatar,
  altura = 240,
}: {
  rotulos: string[];
  rotulosLongos?: string[];
  series: SerieLinha[];
  formatar: (v: number) => string;
  altura?: number;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);
  const margem = { esq: 58, dir: 12, topo: 12, base: 26 };
  const w = Math.max(largura - margem.esq - margem.dir, 10);
  const h = altura - margem.topo - margem.base;
  const maximo = Math.max(0, ...series.flatMap((s) => s.valores));
  const { teto, marcas } = escala(maximo);
  const n = rotulos.length;
  const x = (i: number) => margem.esq + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => margem.topo + h - (v / teto) * h;
  const passoRotulo = Math.max(1, Math.ceil(n / Math.max(Math.floor(w / 58), 1)));

  function mover(evento: React.PointerEvent<SVGRectElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const px = evento.clientX - caixa.left;
    const i = n <= 1 ? 0 : Math.round((px / caixa.width) * (n - 1));
    setAtivo(Math.min(Math.max(i, 0), n - 1));
  }

  return (
    <div ref={ref} className="relative w-full select-none">
      {largura > 0 && (
        <svg width={largura} height={altura} role="img" aria-label={`Gráfico de linhas: ${series.map((s) => s.nome).join(" e ")}`}>
          {marcas.map((m) => (
            <g key={m}>
              <line x1={margem.esq} x2={margem.esq + w} y1={y(m)} y2={y(m)} stroke="#EDEDED" strokeWidth={1} />
              <text x={margem.esq - 8} y={y(m)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[10px]">
                {moedaCompacta(m)}
              </text>
            </g>
          ))}
          {rotulos.map((r, i) =>
            i % passoRotulo === 0 || i === n - 1 ? (
              (i === n - 1 && i % passoRotulo !== 0 && (n - 1) % passoRotulo < passoRotulo / 2) ? null : (
                <text key={i} x={x(i)} y={altura - 8} textAnchor="middle" className="fill-muted text-[10px]">
                  {r}
                </text>
              )
            ) : null
          )}
          {series.map((s) => (
            <polyline
              key={s.nome}
              points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.cor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {n <= 45 &&
            series.map((s) =>
              s.valores.map((v, i) => (v > 0 ? <circle key={`${s.nome}${i}`} cx={x(i)} cy={y(v)} r={2.5} fill={s.cor} stroke="#fff" strokeWidth={1} /> : null))
            )}
          {ativo !== null && (
            <g>
              <line x1={x(ativo)} x2={x(ativo)} y1={margem.topo} y2={margem.topo + h} stroke="#9A9A9A" strokeDasharray="3 3" />
              {series.map((s) => (
                <circle key={s.nome} cx={x(ativo)} cy={y(s.valores[ativo])} r={5} fill={s.cor} stroke="#fff" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect
            x={margem.esq}
            y={margem.topo}
            width={w}
            height={h}
            fill="transparent"
            onPointerMove={mover}
            onPointerDown={mover}
            onPointerLeave={() => setAtivo(null)}
          />
        </svg>
      )}
      {ativo !== null && (
        <Dica x={x(ativo)} y={margem.topo + Math.min(...series.map((s) => y(s.valores[ativo])))} largura={largura}>
          <p className="mb-1 font-semibold text-ink">{(rotulosLongos ?? rotulos)[ativo]}</p>
          {series.map((s) => (
            <p key={s.nome} className="flex items-center justify-between gap-3 whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.cor }} />
                {s.nome}
              </span>
              <span className="font-semibold text-ink">{formatar(s.valores[ativo])}</span>
            </p>
          ))}
        </Dica>
      )}
    </div>
  );
}

// ───────────────────────── Colunas (verticais) ─────────────────────────

export function GraficoColunas({
  itens,
  formatar,
  formatarEixo = moedaCompacta,
  cor = COR_PRINCIPAL,
  altura = 200,
  destacarMaior = true,
}: {
  itens: { rotulo: string; valor: number; detalhe?: string }[];
  formatar: (v: number) => string;
  formatarEixo?: (v: number) => string;
  cor?: string;
  altura?: number;
  destacarMaior?: boolean;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);
  const margem = { esq: 52, dir: 6, topo: 10, base: 24 };
  const w = Math.max(largura - margem.esq - margem.dir, 10);
  const h = altura - margem.topo - margem.base;
  const maximo = Math.max(0, ...itens.map((i) => i.valor));
  const { teto, marcas } = escala(maximo);
  const faixa = w / Math.max(itens.length, 1);
  const larguraBarra = Math.min(Math.max(faixa - 4, 3), 44);
  const indiceMaior = destacarMaior && maximo > 0 ? itens.findIndex((i) => i.valor === maximo) : -1;
  const passoRotulo = Math.max(1, Math.ceil(itens.length / Math.max(Math.floor(w / 34), 1)));

  return (
    <div ref={ref} className="relative w-full select-none">
      {largura > 0 && (
        <svg width={largura} height={altura} role="img" aria-label="Gráfico de colunas">
          {marcas.map((m) => (
            <g key={m}>
              <line x1={margem.esq} x2={margem.esq + w} y1={margem.topo + h - (m / teto) * h} y2={margem.topo + h - (m / teto) * h} stroke="#EDEDED" />
              <text x={margem.esq - 8} y={margem.topo + h - (m / teto) * h} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[10px]">
                {formatarEixo(m)}
              </text>
            </g>
          ))}
          {itens.map((item, i) => {
            const alturaBarra = (item.valor / teto) * h;
            const bx = margem.esq + i * faixa + (faixa - larguraBarra) / 2;
            const by = margem.topo + h - alturaBarra;
            const raio = Math.min(4, larguraBarra / 2, alturaBarra);
            return (
              <g key={item.rotulo + i} onPointerEnter={() => setAtivo(i)} onPointerDown={() => setAtivo(i)} onPointerLeave={() => setAtivo(null)}>
                <rect x={margem.esq + i * faixa} y={margem.topo} width={faixa} height={h} fill={ativo === i ? "#F5F1E8" : "transparent"} />
                {alturaBarra > 0 && (
                  <path
                    d={`M${bx},${margem.topo + h} V${by + raio} Q${bx},${by} ${bx + raio},${by} H${bx + larguraBarra - raio} Q${bx + larguraBarra},${by} ${bx + larguraBarra},${by + raio} V${margem.topo + h} Z`}
                    fill={cor}
                    opacity={indiceMaior === -1 || i === indiceMaior || ativo === i ? 1 : 0.55}
                  />
                )}
                {(i % passoRotulo === 0) && (
                  <text x={margem.esq + i * faixa + faixa / 2} y={altura - 8} textAnchor="middle" className="fill-muted text-[10px]">
                    {item.rotulo}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {ativo !== null && itens[ativo] && (
        <Dica x={margem.esq + ativo * faixa + faixa / 2} y={margem.topo + h - (itens[ativo].valor / teto) * h} largura={largura}>
          <p className="font-semibold text-ink">{itens[ativo].rotulo}</p>
          <p className="whitespace-nowrap text-ink">{formatar(itens[ativo].valor)}</p>
          {itens[ativo].detalhe && <p className="whitespace-nowrap text-muted">{itens[ativo].detalhe}</p>}
        </Dica>
      )}
    </div>
  );
}

// ───────────────────────── Barras horizontais (ranking) ─────────────────────────

export function BarrasHorizontais({
  itens,
  formatar,
  cor = COR_PRINCIPAL,
  vazio = "Sem dados no período.",
}: {
  itens: { rotulo: string; valor: number; detalhe?: string; cor?: string }[];
  formatar: (v: number) => string;
  cor?: string;
  vazio?: string;
}) {
  const maximo = Math.max(0, ...itens.map((i) => i.valor));
  if (itens.length === 0) return <p className="py-6 text-center text-sm text-muted">{vazio}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {itens.map((item, i) => (
        <li key={item.rotulo + i} className="group" title={`${item.rotulo}: ${formatar(item.valor)}${item.detalhe ? ` · ${item.detalhe}` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">
              <span className="mr-1.5 text-xs text-muted">{i + 1}.</span>
              {item.rotulo}
            </span>
            <span className="shrink-0 whitespace-nowrap font-semibold text-ink">
              {formatar(item.valor)}
              {item.detalhe && <span className="ml-1.5 text-xs font-normal text-muted">{item.detalhe}</span>}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F1F1]">
            <div
              className="h-full rounded-full transition-[width] duration-500 group-hover:brightness-110"
              style={{ width: `${maximo > 0 ? Math.max((item.valor / maximo) * 100, item.valor > 0 ? 1.5 : 0) : 0}%`, background: item.cor ?? cor }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ───────────────────────── Rosca (participação) ─────────────────────────

export function GraficoRosca({
  itens,
  formatar,
  centro,
  rotuloCentro,
}: {
  itens: { rotulo: string; valor: number }[];
  formatar: (v: number) => string;
  centro?: string;
  rotuloCentro?: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const total = itens.reduce((s, i) => s + i.valor, 0);
  const tamanho = 168;
  const raio = 66;
  const espessura = 22;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;
  if (total <= 0) return <p className="py-6 text-center text-sm text-muted">Sem dados no período.</p>;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
        <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label="Gráfico de participação" className="-rotate-90">
          <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke="#F1F1F1" strokeWidth={espessura} />
          {itens.map((item, i) => {
            const fracao = item.valor / total;
            const comprimento = Math.max(fracao * circunferencia - (itens.length > 1 ? 2 : 0), 0);
            const deslocamento = -acumulado * circunferencia;
            acumulado += fracao;
            return (
              <circle
                key={item.rotulo}
                cx={tamanho / 2}
                cy={tamanho / 2}
                r={raio}
                fill="none"
                stroke={CORES_CATEGORIAS[i % CORES_CATEGORIAS.length]}
                strokeWidth={ativo === i ? espessura + 6 : espessura}
                strokeDasharray={`${comprimento} ${circunferencia}`}
                strokeDashoffset={deslocamento}
                onPointerEnter={() => setAtivo(i)}
                onPointerDown={() => setAtivo(i)}
                onPointerLeave={() => setAtivo(null)}
                style={{ transition: "stroke-width 150ms" }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {ativo !== null ? (
            <>
              <span className="text-[11px] leading-tight text-muted">{itens[ativo].rotulo}</span>
              <span className="font-display text-base text-ink">{formatar(itens[ativo].valor)}</span>
              <span className="text-[11px] text-muted">{((itens[ativo].valor / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
            </>
          ) : (
            <>
              <span className="text-[11px] text-muted">{rotuloCentro ?? "Total"}</span>
              <span className="font-display text-base text-ink">{centro ?? formatar(total)}</span>
            </>
          )}
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2">
        {itens.map((item, i) => (
          <li
            key={item.rotulo}
            className={`flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm ${ativo === i ? "bg-[#F5F1E8]" : ""}`}
            onPointerEnter={() => setAtivo(i)}
            onPointerLeave={() => setAtivo(null)}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CORES_CATEGORIAS[i % CORES_CATEGORIAS.length] }} />
              <span className="truncate text-ink">{item.rotulo}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-right">
              <span className="font-semibold text-ink">{formatar(item.valor)}</span>
              <span className="ml-1.5 text-xs text-muted">{((item.valor / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── Barra de composição (100%) ─────────────────────────

export function BarraComposicao({ itens, formatar }: { itens: { rotulo: string; valor: number; cor: string }[]; formatar: (v: number) => string }) {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full bg-[#F1F1F1]">
        {total > 0 &&
          itens
            .filter((i) => i.valor > 0)
            .map((item) => (
              <div
                key={item.rotulo}
                title={`${item.rotulo}: ${formatar(item.valor)} (${((item.valor / total) * 100).toFixed(1)}%)`}
                style={{ width: `${(item.valor / total) * 100}%`, background: item.cor }}
                className="h-full first:rounded-l-full last:rounded-r-full"
              />
            ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {itens.map((item) => (
          <div key={item.rotulo} className="flex items-start gap-2">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.cor }} />
            <div className="min-w-0">
              <p className="text-xs text-muted">{item.rotulo}</p>
              <p className="whitespace-nowrap text-sm font-semibold text-ink">
                {formatar(item.valor)}
                <span className="ml-1.5 text-xs font-normal text-muted">{total > 0 ? `${((item.valor / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
