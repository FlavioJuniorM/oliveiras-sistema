// AJUSTE LOCAL (ambiente sem acesso a binaries.prisma.sh): usa o motor wasm + adaptador pg
import { PrismaClient } from "@prisma/client/wasm";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as unknown as import("@prisma/client").PrismaClient;
