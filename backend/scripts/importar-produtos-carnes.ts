import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Grupo = "BOVINAS" | "AVES" | "SUINAS";

const produtos: { codigo: string; nome: string; grupo: Grupo; preco: number; unidade?: "kg" | "un" }[] = [
  { codigo: "000000000020", nome: "ACEM", grupo: "BOVINAS", preco: 41.98 },
  { codigo: "000000000021", nome: "ACEM COM OSSO", grupo: "BOVINAS", preco: 28.98 },
  { codigo: "000000000038", nome: "ALCATRA", grupo: "BOVINAS", preco: 59.98 },
  { codigo: "000000000007", nome: "ASA", grupo: "AVES", preco: 19.98 },
  { codigo: "000000000070", nome: "BACON", grupo: "SUINAS", preco: 47.99 },
  { codigo: "000000000056", nome: "BARRIGA", grupo: "SUINAS", preco: 27.98 },
  { codigo: "000000000031", nome: "BIFE ESPECIAL", grupo: "BOVINAS", preco: 43.99 },
  { codigo: "000000000053", nome: "BISTECA COPA LOMBO", grupo: "SUINAS", preco: 17.98 },
  { codigo: "000000000052", nome: "BISTECA LOMBO", grupo: "SUINAS", preco: 19.98 },
  { codigo: "000000000076", nome: "BUCHO", grupo: "BOVINAS", preco: 27.98 },
  { codigo: "000000000087", nome: "CARNE DE SOL", grupo: "BOVINAS", preco: 46.98 },
  { codigo: "000000000086", nome: "CARNE SECA", grupo: "BOVINAS", preco: 47.98 },
  { codigo: "000000000044", nome: "CHULETA", grupo: "BOVINAS", preco: 48.99 },
  { codigo: "000000000029", nome: "CHULETINHA", grupo: "BOVINAS", preco: 39.99 },
  { codigo: "000000000037", nome: "CONTRA FILE", grupo: "BOVINAS", preco: 61.98 },
  { codigo: "000000000079", nome: "CORACAO BOVINO", grupo: "BOVINAS", preco: 14.98 },
  { codigo: "000000000013", nome: "CORACAO DE FRANGO", grupo: "AVES", preco: 22.98 },
  { codigo: "000000000033", nome: "COSTELA GAUCHA", grupo: "BOVINAS", preco: 32.98 },
  { codigo: "000000000032", nome: "COSTELA PONTA DE AGULHA", grupo: "BOVINAS", preco: 26.99 },
  { codigo: "000000000055", nome: "COSTELINHA CONGELADA", grupo: "SUINAS", preco: 29.98 },
  { codigo: "000000000054", nome: "COSTELINHA FRESCA", grupo: "SUINAS", preco: 28.98 },
  { codigo: "000000000005", nome: "COXA", grupo: "AVES", preco: 11.98 },
  { codigo: "000000000004", nome: "COXA COM SOBRECOXA", grupo: "AVES", preco: 16.98 },
  { codigo: "000000000041", nome: "COXAO DURO", grupo: "BOVINAS", preco: 49.98 },
  { codigo: "000000000040", nome: "COXAO MOLE", grupo: "BOVINAS", preco: 49.98 },
  { codigo: "000000000009", nome: "COXINHA DA ASA", grupo: "AVES", preco: 16.48 },
  { codigo: "000000000026", nome: "CUPIM", grupo: "BOVINAS", preco: 45.99 },
  { codigo: "000000000078", nome: "FIGADO BOVINO", grupo: "BOVINAS", preco: 16.98 },
  { codigo: "000000000088", nome: "FILE EMPANADO", grupo: "AVES", preco: 28.98 },
  { codigo: "000000000036", nome: "FILE MIGNON", grupo: "BOVINAS", preco: 89.99 },
  { codigo: "000000000030", nome: "FRALDINHA", grupo: "BOVINAS", preco: 44.99 },
  { codigo: "000000000001", nome: "FRANGO INTEIRO RESFRIADO", grupo: "AVES", preco: 11.88 },
  { codigo: "000000000080", nome: "FRESSURA", grupo: "BOVINAS", preco: 5.98 },
  { codigo: "000000000011", nome: "GALINHA", grupo: "AVES", preco: 11.98 },
  { codigo: "000000000058", nome: "JOELHO", grupo: "SUINAS", preco: 18.98 },
  { codigo: "000000000042", nome: "LAGARTO", grupo: "BOVINAS", preco: 49.99 },
  { codigo: "000000000067", nome: "LING APIMENTADA", grupo: "SUINAS", preco: 27.98, unidade: "un" },
  { codigo: "000000000071", nome: "LING CALABRESA AURORA", grupo: "SUINAS", preco: 33.98 },
  { codigo: "000000000072", nome: "LING CALABRESA SADIA", grupo: "SUINAS", preco: 33.98 },
  { codigo: "000000000065", nome: "LING TOSCANA AURORA", grupo: "SUINAS", preco: 29.98 },
  { codigo: "000000000066", nome: "LING TOSCANA SADIA", grupo: "SUINAS", preco: 29.98 },
  { codigo: "000000000060", nome: "LOMBINHO", grupo: "SUINAS", preco: 20.99 },
  { codigo: "000000000039", nome: "MAMINHA", grupo: "BOVINAS", preco: 59.99 },
  { codigo: "000000000022", nome: "MIOLO DE ACEM", grupo: "BOVINAS", preco: 42.98 },
  { codigo: "000000000015", nome: "MOCOTO", grupo: "BOVINAS", preco: 16.99 },
  { codigo: "000000000012", nome: "MOELA", grupo: "AVES", preco: 20.98 },
  { codigo: "000000000045", nome: "MOIDA 1", grupo: "BOVINAS", preco: 33.98 },
  { codigo: "000000000034", nome: "MOIDA 2", grupo: "BOVINAS", preco: 35.98 },
  { codigo: "000000000027", nome: "MUSCULO", grupo: "BOVINAS", preco: 39.99 },
  { codigo: "000000000028", nome: "OSSO BUCO", grupo: "BOVINAS", preco: 29.98 },
  { codigo: "000000000023", nome: "PALETA", grupo: "BOVINAS", preco: 42.98 },
  { codigo: "000000000051", nome: "PALETA SUINA", grupo: "SUINAS", preco: 14.98 },
  { codigo: "000000000043", nome: "PATINHO", grupo: "BOVINAS", preco: 49.99 },
  { codigo: "000000000014", nome: "PE DE FRANGO", grupo: "AVES", preco: 9.99 },
  { codigo: "000000000059", nome: "PE SUINO", grupo: "SUINAS", preco: 12.99 },
  { codigo: "000000000002", nome: "PEITO DE FRANGO COM OSSO", grupo: "AVES", preco: 16.98 },
  { codigo: "000000000003", nome: "PEITO DE FRANGO SEM OSSO", grupo: "AVES", preco: 25.48 },
  { codigo: "000000000025", nome: "PEIXINHO", grupo: "BOVINAS", preco: 42.98 },
  { codigo: "000000000050", nome: "PERNIL", grupo: "SUINAS", preco: 14.99 },
  { codigo: "000000000024", nome: "PICADAO", grupo: "BOVINAS", preco: 39.99 },
  { codigo: "000000000035", nome: "PICANHA", grupo: "BOVINAS", preco: 89.98 },
  { codigo: "000000000077", nome: "RABO BOVINO", grupo: "BOVINAS", preco: 41.98 },
  { codigo: "000000000073", nome: "SALSICHA AURORA", grupo: "SUINAS", preco: 13.98 },
  { codigo: "000000000074", nome: "SALSICHA SADIA", grupo: "SUINAS", preco: 18.98 },
  { codigo: "000000000006", nome: "SOBRECOXA", grupo: "AVES", preco: 16.30 },
  { codigo: "000000000057", nome: "TOUCINHO", grupo: "SUINAS", preco: 15.99 },
  { codigo: "000000000008", nome: "TULIPA", grupo: "AVES", preco: 36.48 },
];

const nomesCategorias: Record<Grupo, string> = {
  BOVINAS: "Carnes bovinas",
  AVES: "Carnes de aves",
  SUINAS: "Carnes suínas",
};

async function main() {
  const categorias = new Map<Grupo, string>();
  for (const grupo of Object.keys(nomesCategorias) as Grupo[]) {
    const categoria = await prisma.categoriaProduto.findFirst({ where: { nome: nomesCategorias[grupo] } });
    const salva = categoria ?? await prisma.categoriaProduto.create({ data: { nome: nomesCategorias[grupo] } });
    categorias.set(grupo, salva.id);
  }

  for (const item of produtos) {
    const unidade = item.unidade ?? "kg";
    await prisma.produto.upsert({
      where: { codigo: item.codigo },
      update: {
        nome: item.nome,
        categoriaId: categorias.get(item.grupo),
        tipoVenda: unidade === "un" ? "UNIDADE" : "PESO",
        unidadeMedida: unidade,
        preco: item.preco,
        status: "ATIVO",
      },
      create: {
        codigo: item.codigo,
        nome: item.nome,
        categoriaId: categorias.get(item.grupo),
        tipoVenda: unidade === "un" ? "UNIDADE" : "PESO",
        unidadeMedida: unidade,
        preco: item.preco,
        status: "ATIVO",
      },
    });
  }

  // Mantém o histórico dos três cadastros antigos, mas evita duplicidade no catálogo ativo.
  await prisma.produto.updateMany({
    where: { codigo: { in: ["016", "054", "055"] } },
    data: { status: "INATIVO" },
  });

  console.log(`Importação concluída: ${produtos.length} produtos de carnes bovinas, aves e suínas.`);
  console.log("Nenhum produto de bebida, carvão, tempero, sal, pão, queijo ou item diverso foi incluído.");
}

main().catch((erro) => { console.error(erro); process.exitCode = 1; }).finally(() => prisma.$disconnect());
