import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: "primaria" | "secundaria" | "fantasma" | "perigo";
  tamanho?: "padrao" | "grande";
}

const VARIANTES: Record<string, string> = {
  primaria: "bg-primary text-white hover:bg-primary-dark",
  secundaria: "bg-white text-ink border border-border hover:bg-background",
  fantasma: "bg-transparent text-ink hover:bg-black/5",
  perigo: "bg-danger text-white hover:brightness-90",
};

const TAMANHOS: Record<string, string> = {
  padrao: "h-11 px-5 text-sm",
  grande: "h-14 px-6 text-base",
};

export function Button({
  variante = "primaria",
  tamanho = "padrao",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`balcao-tap inline-flex items-center justify-center gap-2 rounded-lg font-semibold
        transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed
        ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${className}`}
      {...props}
    />
  );
}
