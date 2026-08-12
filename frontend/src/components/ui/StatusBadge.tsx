import { StatusPagamentoPedido } from "../../types";

const CONFIG: Record<string, { rotulo: string; cor: string; ponto: string }> = {
  PAGO: { rotulo: "Pago", cor: "text-success bg-success/10", ponto: "bg-success" },
  DISPONIVEL: { rotulo: "Disponível", cor: "text-success bg-success/10", ponto: "bg-success" },
  PENDENTE: { rotulo: "Pendente", cor: "text-gold bg-gold/10", ponto: "bg-gold" },
  PARCIALMENTE_PAGO: { rotulo: "Parcial", cor: "text-gold bg-gold/10", ponto: "bg-gold" },
  PARCIAL: { rotulo: "Parcial", cor: "text-gold bg-gold/10", ponto: "bg-gold" },
  VENCIDO: { rotulo: "Vencido", cor: "text-danger bg-danger/10", ponto: "bg-danger" },
  CANCELADO: { rotulo: "Cancelado", cor: "text-danger bg-danger/10", ponto: "bg-danger" },
  ATIVO: { rotulo: "Ativo", cor: "text-success bg-success/10", ponto: "bg-success" },
  INATIVO: { rotulo: "Inativo", cor: "text-muted bg-black/5", ponto: "bg-muted" },
  RECEBIDO: { rotulo: "Recebido", cor: "text-primary bg-primary/10", ponto: "bg-primary" },
  EM_PREPARO: { rotulo: "Em preparo", cor: "text-gold bg-gold/10", ponto: "bg-gold" },
  EXPEDICAO: { rotulo: "Expedição", cor: "text-success bg-success/10", ponto: "bg-success" },
  PRONTO: { rotulo: "Pronto", cor: "text-success bg-success/10", ponto: "bg-success" },
  EM_ENTREGA: { rotulo: "Em entrega", cor: "text-blue-700 bg-blue-100", ponto: "bg-blue-700" },
  ENTREGUE: { rotulo: "Entregue", cor: "text-muted bg-black/5", ponto: "bg-muted" },
};

export function StatusBadge({ status }: { status: StatusPagamentoPedido | string }) {
  const config = CONFIG[status] || { rotulo: status, cor: "text-muted bg-black/5", ponto: "bg-muted" };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.cor}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.ponto}`} />
      {config.rotulo}
    </span>
  );
}
