import { Card } from "./Card";

interface KpiCardProps {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  tom?: "neutro" | "sucesso" | "alerta" | "perigo";
}

const TONS: Record<string, string> = {
  neutro: "text-ink",
  sucesso: "text-success",
  alerta: "text-gold",
  perigo: "text-danger",
};

export function KpiCard({ rotulo, valor, destaque = false, tom = "neutro" }: KpiCardProps) {
  return (
    <Card>
      <p className="text-muted text-sm font-medium">{rotulo}</p>
      <p
        className={`mt-2 font-display text-3xl tracking-wide ${
          destaque ? "text-gold" : TONS[tom]
        }`}
      >
        {valor}
      </p>
    </Card>
  );
}
