import dotenv from "dotenv";
import http from "http";
import { app } from "./app.js";
import { initializeSocketServer } from "./realtime/socketServer.js";
import { prisma } from "./lib/prisma.js";
import { ComandaService } from "./services/ComandaService.js";

dotenv.config();

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const port = Number(process.env.PORT || 3000);
const server = http.createServer(app);
const comandaService = new ComandaService();

initializeSocketServer(server);

// Auto-migrate new columns so the server never fails due to missing columns
async function runMigrations() {
  const migrations = [
    `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'VIAGEM'`,
    `CREATE TABLE IF NOT EXISTS "Comanda" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "number" INTEGER NOT NULL, "accessToken" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Comanda_pkey" PRIMARY KEY ("id"))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Comanda_number_key" ON "Comanda"("number")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Comanda_accessToken_key" ON "Comanda"("accessToken")`,
    `ALTER TABLE "Comanda" ADD COLUMN IF NOT EXISTS "isTemporary" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Comanda" ADD COLUMN IF NOT EXISTS "createdByRole" TEXT`,
    `ALTER TABLE "Comanda" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "comandaId" TEXT`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Order_idempotencyKey_key" ON "Order"("idempotencyKey")`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isPickup" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "assignedMotoboyId" TEXT`,
    `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryCode" TEXT`,
    `ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
    `ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "priceVariant" TEXT`,
    `ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "waiterDeliveredAt" TIMESTAMP(3)`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isAddon" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "hasPriceVariants" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "commercialPrice" DECIMAL(10,2)`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "pratoFeitoPrice" DECIMAL(10,2)`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "commercialCostPrice" DECIMAL(10,2)`,
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "pratoFeitoCostPrice" DECIMAL(10,2)`,
  ];
  for (const sql of migrations) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      console.error("[migration] falhou:", sql, err.message);
    }
  }
  console.log("[migration] colunas verificadas/criadas com sucesso");
}

function getSaoPauloDayStartUtc(date = new Date()) {
  const saoPauloOffsetMs = 3 * 60 * 60 * 1000;
  const saoPauloDate = new Date(date.getTime() - saoPauloOffsetMs);
  return new Date(
    Date.UTC(
      saoPauloDate.getUTCFullYear(),
      saoPauloDate.getUTCMonth(),
      saoPauloDate.getUTCDate(),
      3,
      0,
      0,
      0,
    ),
  );
}

function msUntilNextSaoPauloMidnight() {
  const todayStart = getSaoPauloDayStartUtc();
  const nextStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return Math.max(1000, nextStart.getTime() - Date.now());
}

async function cleanupTemporaryComandas() {
  const cutoff = getSaoPauloDayStartUtc();
  try {
    const result = await comandaService.cleanupTemporaryCreatedBefore(cutoff);
    if (result.deletedCount > 0) {
      console.log(
        `[comandas] ${result.deletedCount} comandas temporarias removidas`,
      );
    }
  } catch (err) {
    console.error("[comandas] falha ao limpar comandas temporarias:", err);
  }
}

function scheduleTemporaryComandaCleanup() {
  const timeout = setTimeout(async () => {
    await cleanupTemporaryComandas();
    scheduleTemporaryComandaCleanup();
  }, msUntilNextSaoPauloMidnight());

  if (typeof timeout.unref === "function") timeout.unref();
}

runMigrations().then(async () => {
  await cleanupTemporaryComandas();
  scheduleTemporaryComandaCleanup();

  server.listen(port, () => {
    console.log(`API Pizzaria China rodando na porta ${port}`);
  });
});
