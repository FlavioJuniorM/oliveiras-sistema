import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ className = "", padded = true, children, ...props }: CardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-card shadow-card ${
        padded ? "p-5" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitulo({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-ink font-semibold text-base ${className}`}>{children}</h3>;
}

export function CardSubtitulo({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-muted text-sm ${className}`}>{children}</p>;
}
