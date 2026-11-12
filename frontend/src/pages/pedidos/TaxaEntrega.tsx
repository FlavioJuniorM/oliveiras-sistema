import { formatarMoeda } from "../../lib/formatadores";
import type { Pedido } from "../../types";

/** "7,50" / "7.5" / "" → número (vazio = null) */
export function lerTaxa(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : NaN;
}

export function taxaInicial(pedido: Pedido) {
  const taxa = Number(pedido.taxaEntrega ?? 0);
  return taxa > 0 ? taxa.toFixed(2).replace(".", ",") : "";
}

/** Valor dos produtos (sem taxa), já com desconto. */
export function valorProdutos(pedido: Pedido) {
  return Number((Number(pedido.subtotal ?? 0) - Number(pedido.desconto ?? 0)).toFixed(2));
}

const VALORES_RAPIDOS = [5, 7, 10, 15];

/** Campo da taxa de entrega cobrada do cliente, com valores rápidos. */
export function CampoTaxaEntrega({ valor, onChange, id = "taxa-entrega" }: { valor: string; onChange: (v: string) => void; id?: string }) {
  const numero = lerTaxa(valor);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Taxa de entrega cobrada do cliente (R$)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          placeholder="Ex.: 8,00"
          value={valor}
          onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ""))}
          className={`h-11 w-32 rounded-lg border bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 ${Number.isNaN(numero) ? "border-danger" : "border-border focus:border-primary"}`}
        />
        {VALORES_RAPIDOS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v.toFixed(2).replace(".", ","))}
            className={`h-11 rounded-lg border px-3 text-sm font-semibold ${numero === v ? "border-primary bg-primary/5 text-primary" : "border-border bg-white text-ink"}`}
          >
            R$ {v}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange("0")}
          className={`h-11 rounded-lg border px-3 text-sm font-semibold ${numero === 0 ? "border-primary bg-primary/5 text-primary" : "border-border bg-white text-ink"}`}
        >
          Grátis
        </button>
      </div>
      {Number.isNaN(numero) && <p className="text-xs font-semibold text-danger">Valor inválido.</p>}
    </div>
  );
}

/** Quadro: valor dos produtos + taxa de entrega = total (igual ao que sai na nota). */
export function ResumoComTaxa({ produtos, taxa }: { produtos: number; taxa: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white text-sm">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-muted">Valor dos produtos</span>
        <span className="font-semibold text-ink">{formatarMoeda(produtos)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <span className="text-muted">Taxa de entrega</span>
        <span className="font-semibold text-ink">{taxa > 0 ? formatarMoeda(taxa) : "Grátis"}</span>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-background px-4 py-2.5">
        <span className="font-semibold text-ink">Total</span>
        <span className="font-display text-2xl text-gold-texto">{formatarMoeda(produtos + taxa)}</span>
      </div>
    </div>
  );
}
