# Backend — Casa de Carnes Oliveiras (Fase 1: Fundação)

Esta é a primeira fase do sistema: banco de dados, autenticação por login/senha
com JWT e controle de permissões por papel (FUNCIONARIO / ADMINISTRATIVO).

## O que já funciona

- `POST /auth/login` — autenticação, retorna token JWT
- `GET /auth/me` — retorna os dados do usuário logado (valida o token)
- `GET /usuarios` — lista usuários (somente ADMINISTRATIVO)
- `POST /usuarios` — cria usuário (somente ADMINISTRATIVO)
- `PATCH /usuarios/:id/inativar` — inativa usuário (somente ADMINISTRATIVO)
- Todo login e criação/inativação de usuário gera registro em `logs` (auditoria)

## Como rodar localmente

O projeto inclui um runtime portátil do PostgreSQL em `.postgresql/runtime/pgsql`.
Use `npm run db:start` para iniciar o banco, `npm run db:status` para verificar o estado
e `npm run db:stop` para pará-lo. Os dados ficam em `.postgresql/data`.

1. Tenha um PostgreSQL rodando (local ou em nuvem — ex: Supabase, Railway, Neon).
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL` com a string de conexão
   do seu banco, e gere um valor aleatório forte para `JWT_SECRET`.
3. Instale as dependências:
   ```
   npm install
   ```
4. Crie as tabelas no banco a partir do schema:
   ```
   npx prisma migrate dev --name inicial
   ```
5. Crie o primeiro usuário administrativo:
   ```
   npx tsx prisma/seed.ts
   ```
   Isso cria o login `admin` com senha `admin123` — troque assim que possível.
6. Suba o servidor em modo desenvolvimento:
   ```
   npm run dev
   ```
7. Teste o login:
   ```
   curl -X POST http://localhost:3333/auth/login \
     -H "Content-Type: application/json" \
     -d '{"login": "admin", "senha": "admin123"}'
   ```
   A resposta traz um `token` — use-o nas próximas requisições como
   `Authorization: Bearer <token>`.

## Fase 2: Clientes e Produtos (já implementada)

Clientes:
- `GET /clientes?busca=termo` — busca por nome, documento (CPF/CNPJ), telefone ou WhatsApp
- `GET /clientes/:id` — dados de um cliente
- `GET /clientes/:id/historico` — histórico financeiro completo (total comprado, pago,
  em aberto, vencido, última compra, pedidos e pagamentos)
- `POST /clientes` — cadastrar (funcionário ou admin)
- `PUT /clientes/:id` — editar dados
- `PATCH /clientes/:id/inativar` — inativar (somente admin)

Categorias de produto:
- `GET /categorias` — listar
- `POST /categorias` — criar (somente admin)

Produtos/carnes:
- `GET /produtos` — listar (funcionário ou admin)
- `GET /produtos/:id` — detalhe
- `POST /produtos` — cadastrar com preço inicial (somente admin)
- `PUT /produtos/:id` — editar nome/categoria/status — **nunca altera preço** (somente admin)
- `PATCH /produtos/:id/preco` — **única rota que altera preço** (somente admin, sempre auditada)
- `PATCH /produtos/:id/inativar` — inativar (somente admin)

## Fase 3: Pedidos/Comandas (já implementada) — núcleo do sistema

- `POST /pedidos` — cria e finaliza um pedido em uma única chamada:
  - recebe `clienteId` (opcional — permite venda avulsa), lista de `itens`
    (`produtoId` + `pesoOuQtd`), `desconto` opcional, `pagamentos` (split de formas
    imediatas) e, se houver saldo a prazo, `valorAPrazo` + `vencimento`
  - o preço vem **sempre** do cadastro do produto — o funcionário nunca informa preço
  - calcula subtotal/total automaticamente (peso × preço) e gera a numeração
    sequencial no formato `ANO-NNNNNN` de forma segura contra concorrência
  - desconto só é aceito se quem está logado é ADMINISTRATIVO
  - se sobrar saldo, cria automaticamente o registro em Contas a Receber
    (exige cliente cadastrado — não é possível vender a prazo para cliente avulso)
  - define o status do pedido automaticamente: PAGO / PARCIALMENTE_PAGO / PENDENTE
- `GET /pedidos?status=&clienteId=` — listagem com filtros
- `GET /pedidos/:id` — detalhe completo (itens, pagamentos, conta a receber, nota fiscal)
- `POST /pedidos/:id/pagamentos` — registra um novo pagamento sobre um pedido existente
  (quitação total ou parcial); atualiza automaticamente o saldo da conta a receber e
  o status do pedido
- `PATCH /pedidos/:id/cancelar` — cancela o pedido (somente admin); pedido nunca é
  apagado, apenas marcado como CANCELADO, e a conta a receber associada também é
  cancelada

Toda a jornada gera entradas de auditoria (`CRIOU_PEDIDO`, `ADICIONOU_ITEM_PEDIDO`,
`REGISTROU_PAGAMENTO`, `CANCELOU_PEDIDO`, etc.), seguindo os exemplos da seção 13
da especificação.

## Fase 4: Dashboard, Contas a Pagar, Relatórios e Impressão (já implementada)

**Dashboard** (`GET /dashboard`, somente admin) — vendas do dia/mês, recebido hoje,
a receber, vencido, número de pedidos e clientes atendidos hoje, produtos mais
vendidos no mês, contas a receber vencidas/próximas do vencimento (7 dias) e contas
a pagar próximas do vencimento.

**Contas a Pagar** (somente admin):
- `GET /contas-pagar?status=&categoria=` — lista com filtros; vencidas são marcadas
  automaticamente na leitura
- `POST /contas-pagar` — lança uma despesa (fornecedor, categoria, valor, vencimento)
- `PATCH /contas-pagar/:id/pagar` — registra baixa total ou parcial
- `PATCH /contas-pagar/:id/cancelar` — cancela o lançamento sem apagar (mantém histórico)

**Relatórios** (somente admin), todos recebendo `?inicio=AAAA-MM-DD&fim=AAAA-MM-DD`:
- `GET /relatorios/vendas` — total do período e série por dia
- `GET /relatorios/produtos` — mais vendidos por quantidade e faturamento
- `GET /relatorios/clientes` — ranking de compradores, inadimplentes e contas em aberto
- `GET /relatorios/financeiro` — recebido, a receber, vencido, contas a pagar e fluxo
  de caixa simplificado do período

**Impressão da comanda** — `GET /pedidos/:id/impressao?formato=termica58|termica80|a4`
- `termica58` / `termica80`: texto puro formatado para impressora térmica (32/42 colunas)
- `a4`: HTML pronto para impressão em A4 no navegador — usar Ctrl+P → "Salvar como PDF"
  cobre a exportação em PDF sem depender de biblioteca extra nesta fase
- Sempre traz nome da loja, número do pedido, data/hora, cliente, itens com peso e
  preço/kg, subtotal, desconto, total, forma(s) de pagamento, saldo a receber e
  vencimento em destaque quando houver, e o atendente responsável (seção 11)

## MVP completo (seção 21 da especificação)

Login, usuários, clientes, produtos/carnes, pedidos/comandas com cálculo automático,
formas e status de pagamento, contas a receber, impressão, dashboard, histórico/auditoria,
contas a pagar e relatórios — todos implementados.

## Possíveis próximos passos (fase 2 da especificação)

- Estoque
- Integração fiscal (NF-e/NFC-e) — a estrutura de `notas_fiscais` já existe, separada do pedido
- Integração com Pix
- Integração com WhatsApp
- Exportação de relatórios para PDF/Excel
- Frontend (React + TypeScript + Tailwind)
