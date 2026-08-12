# Frontend — Casa de Carnes Oliveiras

Interface web do sistema, construída com React + TypeScript + Tailwind CSS,
seguindo a identidade visual oficial da marca (paleta, tipografia Oswald/Inter e logo).

## Como rodar

1. Tenha o backend rodando (ver `../backend/README.md`).
2. Copie `.env.example` para `.env` e ajuste `VITE_API_URL` se necessário.
3. Instale as dependências:
   ```
   npm install
   ```
4. Suba o servidor de desenvolvimento:
   ```
   npm run dev
   ```
5. Acesse `http://localhost:5173` e entre com o usuário criado pelo seed do backend
   (`admin` / `admin123`).

## O que já está implementado

- **Login** com a identidade visual da marca
- **Dashboard** administrativo (KPIs, produtos mais vendidos, contas próximas do
  vencimento) — visível apenas para o papel Administrativo
- **Novo Pedido**: fluxo principal de balcão — busca/seleção de cliente (ou venda
  avulsa), seleção de produtos com pesagem, cálculo automático, desconto (somente
  admin), pagamento dividido entre várias formas + parte a prazo, finalização e
  atalhos de impressão (térmica e A4/PDF)
- **Pedidos do dia**: listagem com status coloridos
- **Clientes**: busca rápida e cadastro
- **Produtos/Carnes**: listagem, cadastro e alteração de preço isolada (somente admin)
- **Contas a Receber**: pedidos em aberto com registro de pagamento (quitação total
  ou parcial)
- **Contas a Pagar**: lançamento de despesas por categoria
- **Relatórios**: vendas, produtos, clientes e financeiro por período
- **Usuários**: cadastro de funcionário/administrativo

## Identidade visual

- Sidebar `#111111`, item ativo `#C8102E`, texto branco
- Fundo do sistema `#F3F3F3`, cards brancos com borda `#E5E5E5`
- Botões primários `#C8102E` (hover `#8B0D1F`)
- Destaques/valores em dourado `#D4A72C`
- Status: verde `#198754` (pago), dourado `#D4A72C` (pendente/parcial), vermelho
  `#DC3545` (vencido/cancelado)
- Tipografia: `Oswald` para títulos/números de destaque, `Inter` para o restante do texto
- Menu inferior fixo em telas pequenas, priorizando "Novo Pedido" — pensado para uso
  no balcão em tablet/celular
