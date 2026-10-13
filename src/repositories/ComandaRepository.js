import { startOfBusinessDay } from "../lib/businessDay.js";
import { prisma } from "../lib/prisma.js";

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
    // Mesma regra do caixa: so conta pedido com item em aberto, e se parte
    // ja foi paga soma apenas os itens em aberto. Antes um pedido com todos
    // os itens pagos (mas ainda PENDENTE) ficava "ativo" aqui e sumido do caixa.
    const rows = await prisma.$queryRaw`
      SELECT
        o."comandaId",
        SUM(
          CASE WHEN items.paid_count = 0 THEN o.total
               ELSE items.unpaid_total END
        ) AS "pendingTotal",
        COUNT(o.id)  AS "activeCount"
      FROM "Order" o
      CROSS JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE oi."paidAt" IS NULL) AS unpaid_count,
          COUNT(*) FILTER (WHERE oi."paidAt" IS NOT NULL) AS paid_count,
          COALESCE(SUM(oi."totalPrice") FILTER (WHERE oi."paidAt" IS NULL), 0)
            AS unpaid_total
        FROM "OrderItem" oi
        WHERE oi."orderId" = o.id
      ) items
      WHERE o."comandaId" IS NOT NULL
        AND o.status::text <> 'CANCELADO'
        AND o."paymentStatus"::text <> 'APROVADO'
        AND COALESCE(o."paymentMethod"::text, '') <> 'PENDENTE'
        AND o.total > 0
        AND items.unpaid_count > 0
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
        status: { notIn: ["CANCELADO"] },
        // Pedidos do dia + pedidos antigos que ainda tem item em aberto, para a
        // comanda mostrar (e dar baixa em) tudo o que o caixa tambem mostra.
        OR: [
          { createdAt: { gte: startOfBusinessDay() } },
          {
            paymentStatus: { not: "APROVADO" },
            items: { some: { paidAt: null } },
            OR: [
              { paymentMethod: null },
              { paymentMethod: { not: "PENDENTE" } },
            ],
          },
        ],
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
