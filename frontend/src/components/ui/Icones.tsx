import type { SVGProps } from "react";

/** Ícones de traço simples (estilo Lucide), desenhados aqui para não depender de biblioteca. */
type PropsIcone = SVGProps<SVGSVGElement> & { tamanho?: number };

function Base({ tamanho = 20, children, ...props }: PropsIcone & { children: React.ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconePainel = (p: PropsIcone) => (
  <Base {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Base>
);
export const IconeMais = (p: PropsIcone) => (
  <Base {...p}><path d="M12 5v14M5 12h14" /></Base>
);
export const IconePedidos = (p: PropsIcone) => (
  <Base {...p}><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" /><path d="M16 5h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2" /><path d="M9 12h6M9 16h4" /></Base>
);
export const IconeClientes = (p: PropsIcone) => (
  <Base {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5.1" /></Base>
);
export const IconeCarne = (p: PropsIcone) => (
  <Base {...p}><path d="M14.5 3.5c3.6 0 6 2.6 6 5.8 0 4.6-5 9.7-11 9.7-3 0-5-1.7-5-4.3 0-2.3 1.6-3.6 3.2-4.6C10 8.8 10.4 3.5 14.5 3.5Z" /><circle cx="14.5" cy="9" r="1.8" /></Base>
);
export const IconeCaixa = (p: PropsIcone) => (
  <Base {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" /><circle cx="12" cy="13.5" r="2.5" /></Base>
);
export const IconeReceber = (p: PropsIcone) => (
  <Base {...p}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Base>
);
export const IconePagar = (p: PropsIcone) => (
  <Base {...p}><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Base>
);
export const IconeRelatorio = (p: PropsIcone) => (
  <Base {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Base>
);
export const IconeUsuarios = (p: PropsIcone) => (
  <Base {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Base>
);
export const IconeConfig = (p: PropsIcone) => (
  <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Base>
);
export const IconeSair = (p: PropsIcone) => (
  <Base {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Base>
);
export const IconeChave = (p: PropsIcone) => (
  <Base {...p}><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" /></Base>
);
export const IconeCalendario = (p: PropsIcone) => (
  <Base {...p}><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></Base>
);
export const IconeLapis = (p: PropsIcone) => (
  <Base {...p}><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></Base>
);
export const IconeLixeira = (p: PropsIcone) => (
  <Base {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></Base>
);
export const IconeLista = (p: PropsIcone) => (
  <Base {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Base>
);
export const IconeSetaEsq = (p: PropsIcone) => (
  <Base {...p}><path d="m15 18-6-6 6-6" /></Base>
);
export const IconeSetaDir = (p: PropsIcone) => (
  <Base {...p}><path d="m9 18 6-6-6-6" /></Base>
);
export const IconeCaminhao = (p: PropsIcone) => (
  <Base {...p}><path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></Base>
);
export const IconeCracha = (p: PropsIcone) => (
  <Base {...p}><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M9 5V3h6v2" /><circle cx="9" cy="11.5" r="2" /><path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 10h3M15 13.5h3" /></Base>
);
export const IconeDownload = (p: PropsIcone) => (
  <Base {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Base>
);
export const IconeAtualizar = (p: PropsIcone) => (
  <Base {...p}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></Base>
);
