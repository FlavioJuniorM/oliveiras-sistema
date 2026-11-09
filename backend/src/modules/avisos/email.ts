import nodemailer from "nodemailer";

/**
 * Envio de e-mail por SMTP (ex.: Gmail com "senha de app").
 * Variáveis na Vercel (projeto do backend):
 *   SMTP_USUARIO  e-mail que envia (ex.: casadecarnesoliveiras@gmail.com)
 *   SMTP_SENHA    senha de app do Google (16 letras) — nunca a senha normal
 *   SMTP_HOST     opcional, padrão smtp.gmail.com
 *   SMTP_PORTA    opcional, padrão 465
 */
export function emailConfigurado() {
  return Boolean(process.env.SMTP_USUARIO && process.env.SMTP_SENHA);
}

export async function enviarEmail(para: string[], assunto: string, html: string, texto: string) {
  if (!emailConfigurado()) {
    throw new Error("O envio de e-mail ainda não foi configurado no servidor (SMTP_USUARIO e SMTP_SENHA).");
  }
  const porta = Number(process.env.SMTP_PORTA || 465);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: porta,
    secure: porta === 465,
    auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_SENHA },
  });
  await transporte.sendMail({
    from: `"Casa de Carnes Oliveiras" <${process.env.SMTP_USUARIO}>`,
    to: para.join(", "),
    subject: assunto,
    html,
    text: texto,
  });
}
