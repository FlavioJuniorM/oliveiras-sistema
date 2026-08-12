# Publicação na Vercel

O projeto está preparado para dois projetos Vercel:

- `oliveiras-frontend`: diretório raiz `frontend`
- `oliveiras-backend`: diretório raiz `backend`

## 1. Banco PostgreSQL online

Crie um PostgreSQL no Marketplace da Vercel, Neon ou Supabase e copie a conexão.
Ela será usada como `DATABASE_URL` no projeto do backend.

## 2. Backend

Na Vercel, importe o mesmo repositório e configure:

- Root Directory: `backend`
- Build Command: `npm run prisma:generate`
- Output Directory: deixar vazio
- Node.js: `20.x`

Variáveis de ambiente:

```text
DATABASE_URL=postgresql://...online...?schema=public&sslmode=require
JWT_SECRET=um-segredo-longo-e-aleatorio
JWT_EXPIRES_IN=8h
```

Depois do banco online estar configurado, aplique as migrations uma vez:

```powershell
cd backend
$env:DATABASE_URL="COLE_A_URL_ONLINE_AQUI"
npx prisma migrate deploy
```

O endereço final do backend será parecido com:

```text
https://oliveiras-backend.vercel.app
```

## 3. Frontend

Crie outro projeto Vercel apontando para o mesmo repositório:

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js: `20.x`

Variável de ambiente:

```text
VITE_API_URL=https://oliveiras-backend.vercel.app
```

O frontend ficará em um endereço parecido com:

```text
https://oliveiras-frontend.vercel.app
```

## 4. Dados atuais

O backup local fica em `backups/`. Para importar os dados, use `pg_restore` ou
`psql` com a URL do banco online. Não publique a pasta `backups/` nem qualquer
arquivo `.env` no GitHub.

## 5. Atualizações futuras

Depois de conectar o repositório ao GitHub, cada push na branch configurada gera
um novo deploy automático na Vercel. Para alterações de banco, crie a migration
localmente com `npx prisma migrate dev` e a Vercel deverá aplicar as migrations
pendentes com `npx prisma migrate deploy` no processo de publicação.
