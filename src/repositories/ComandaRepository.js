import { prisma } from "../lib/prisma.js";

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

async function attachProducts(orders) {
  if (!orders.length) return [];

  const productIds = Array.from(
    new Set(
      orders
        .flatMap((order) => order.items ?? [])
        .map((item) => item.productId)
        .filter(Boolean),
    ),
  );

  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, imageUrl: true, category: true },
      })
    : [];

  const productMap = new Map(
    products.map((product) => [product.id, product]),
  );

  return orders.map((order) => ({
    ...order,
    items: (order.items ?? []).map((item) => ({
      ...item,
      product: productMap.get(item.productId) ?? null,
    })),
  }));
}

export class ComandaRepository {
  async create(data) {
    return prisma.comanda.create({ data });
  }

  async findAll() {
    return prisma.comanda.findMany({ orderBy: { number: "asc" } });
  }

  async findById(id) {
    return prisma.comanda.findUnique({ where: { id } });
  }

  async findByAccessToken(accessToken) {
    return prisma.comanda.findUnique({ where: { accessToken } });
  }

  async update(id, data) {
    return prisma.comanda.update({ where: { id }, data });
  }

  async delete(id) {
    return prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { comandaId: id },
        data: { comandaId: null },
      });

      return tx.comanda.delete({ where: { id } });
    });
  }

  async cleanupTemporaryCreatedBefore(cutoff) {
    const temporaryComandas = await prisma.comanda.findMany({
      where: {
        isTemporary: true,
        createdByRole: "ATENDENTE",
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    const ids = temporaryComandas.map((comanda) => comanda.id);
    if (!ids.length) return { deletedCount: 0 };

    await prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { comandaId: { in: ids } },
        data: { comandaId: null },
      });

      await tx.comanda.deleteMany({
        where: { id: { in: ids } },
      });
    });

    return { deletedCount: ids.length };
  }

  async findAllOpenTotals() {
    const rows = await prisma.$queryRaw`
      SELECT
        o."comandaId",
        SUM(o.total) AS "pendingTotal",
        COUNT(o.id)  AS "activeCount"
      FROM "Order" o
      WHERE o."comandaId" IS NOT NULL
        AND o.status::text <> 'CANCELADO'
        AND o."paymentStatus"::text <> 'APROVADO'
        AND COALESCE(o."paymentMethod"::text, '') <> 'PENDENTE'
      GROUP BY o."comandaId"
    `;

    return rows.map((row) => ({
      comandaId: row.comandaId,
      pendingTotal: Number(row.pendingTotal ?? 0),
      activeCount: Number(row.activeCount ?? 0),
    }));
  }

  async findOrdersToday(comandaId) {
    const orders = await prisma.order.findMany({
      where: {
        comandaId,
        createdAt: { gte: startOfToday() },
        status: { notIn: ["CANCELADO"] },
      },
      include: {
        items: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return attachProducts(orders);
  }

  async findSummaryByToken(accessToken) {
    const comanda = await this.findByAccessToken(accessToken);
    if (!comanda) return null;

    const orders = await this.findOrdersToday(comanda.id);
    const pendingTotal = orders
      .filter((order) => order.paymentStatus !== "APROVADO")
      .reduce((sum, order) => sum + Number(order.total ?? 0), 0);

    return {
      comanda,
      pendingTotal,
      ordersCount: orders.length,
      pendingOrdersCount: orders.filter(
        (order) => order.paymentStatus !== "APROVADO",
      ).length,
      orders,
    };
  }
}
