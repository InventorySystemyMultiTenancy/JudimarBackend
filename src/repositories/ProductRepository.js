import { prisma } from "../lib/prisma.js";

// Busca metadados via raw SQL (compatível com qualquer versão do Prisma Client)
async function fetchProductMetadata(ids) {
  if (!ids.length) return new Map();
  const rows =
    await prisma.$queryRaw`SELECT "id", "category" FROM "Product" WHERE "id" = ANY(${ids})`;
  return new Map(
    rows.map((r) => [
      r.id,
      {
        category: r.category ?? "Geral",
      },
    ]),
  );
}

export class ProductRepository {
  async findAll() {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { sizes: { orderBy: { size: "asc" } } },
      orderBy: [{ isCrust: "asc" }, { name: "asc" }],
    });
    const metaMap = await fetchProductMetadata(products.map((p) => p.id));
    return products.map((p) => {
      const { stock, stockMinimum, ...rest } = p;
      return {
        ...rest,
        category: metaMap.get(p.id)?.category ?? "Geral",
      };
    });
  }

  async findAllForAdmin() {
    const products = await prisma.product.findMany({
      include: { sizes: { orderBy: { size: "asc" } } },
      orderBy: [{ isCrust: "asc" }, { name: "asc" }],
    });
    const metaMap = await fetchProductMetadata(products.map((p) => p.id));
    return products.map((p) => {
      const { stock, stockMinimum, ...rest } = p;
      return {
        ...rest,
        category: metaMap.get(p.id)?.category ?? "Geral",
      };
    });
  }

  async create({ name, description, imageUrl, category, isCrust, sizes }) {
    // Campos adicionados depois do Prisma Client podem ser gravados via raw SQL.
    const product = await prisma.product.create({
      data: {
        name,
        description: description ?? null,
        imageUrl: imageUrl ?? null,
        isCrust: isCrust ?? false,
        sizes: {
          create: sizes.map(({ size, price, costPrice }) => ({
            size,
            price,
            ...(costPrice != null ? { costPrice } : {}),
          })),
        },
      },
      include: { sizes: { orderBy: { size: "asc" } } },
    });
    const cat = category ?? "Geral";
    await prisma.$executeRaw`
      UPDATE "Product"
      SET "category" = ${cat}
      WHERE "id" = ${product.id}
    `;
    const { stock, stockMinimum, ...rest } = product;
    return { ...rest, category: cat };
  }

  async update(
    productId,
    { name, description, imageUrl, category, isCrust, sizes },
  ) {
    return prisma.$transaction(async (tx) => {
      let resolvedCategory = category;

      await tx.product.update({
        where: { id: productId },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(isCrust !== undefined && { isCrust }),
        },
      });

      if (category !== undefined) {
        const existingRow = await tx.$queryRaw`
          SELECT "category"
          FROM "Product"
          WHERE "id" = ${productId}
        `;
        const current = existingRow?.[0] ?? {};
        resolvedCategory = category ?? current.category ?? "Geral";
        await tx.$executeRaw`
          UPDATE "Product"
          SET
            "category" = ${resolvedCategory}
          WHERE "id" = ${productId}
        `;
      }

      if (sizes) {
        await tx.productSize.deleteMany({ where: { productId } });
        await tx.productSize.createMany({
          data: sizes.map(({ size, price, costPrice }) => ({
            productId,
            size,
            price,
            ...(costPrice != null ? { costPrice } : {}),
          })),
        });
      }

      const updated = await tx.product.findUnique({
        where: { id: productId },
        include: { sizes: { orderBy: { size: "asc" } } },
      });
      const { stock, stockMinimum, ...rest } = updated ?? {};
      return {
        ...rest,
        category: resolvedCategory ?? updated?.category ?? "Geral",
      };
    });
  }

  async setActive(productId, isActive) {
    return prisma.product.update({
      where: { id: productId },
      data: { isActive },
    });
  }

  async findByIdWithSizes(productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { sizes: true },
    });
    if (!product) return null;
    const metaMap = await fetchProductMetadata([productId]);
    const { stock, stockMinimum, ...rest } = product;
    return {
      ...rest,
      category: metaMap.get(productId)?.category ?? "Geral",
    };
  }

  async findTopSelling(limit = 6) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT oi."productId", SUM(oi.quantity)::int AS "soldCount"
       FROM "OrderItem" oi
       INNER JOIN "Order" o ON o.id = oi."orderId"
       INNER JOIN "Product" p ON p.id = oi."productId"
       WHERE oi."productId" IS NOT NULL
         AND o."paymentStatus"::text = 'APROVADO'
         AND p."isActive" = true
         AND p."isCrust" = false
       GROUP BY oi."productId"
       ORDER BY "soldCount" DESC, oi."productId" ASC
       LIMIT $1`,
      limit,
    );

    if (!rows.length) {
      return [];
    }

    const ids = rows.map((row) => row.productId);
    const soldCountById = new Map(
      rows.map((row) => [row.productId, row.soldCount]),
    );
    const products = await prisma.product.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        isCrust: false,
      },
      include: {
        sizes: { orderBy: { size: "asc" } },
      },
    });

    const metaMap = await fetchProductMetadata(
      products.map((product) => product.id),
    );
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    return ids
      .map((id) => productsById.get(id))
      .filter(Boolean)
      .map((product) => {
        const { stock, stockMinimum, ...rest } = product;
        return {
          ...rest,
          category: metaMap.get(product.id)?.category ?? "Geral",
          soldCount: soldCountById.get(product.id) ?? 0,
        };
      });
  }

  async findSizePrice(productId, size, { isCrust } = {}) {
    const sizeEntry = await prisma.productSize.findUnique({
      where: {
        productId_size: {
          productId,
          size,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            isActive: true,
            isCrust: true,
          },
        },
      },
    });

    if (!sizeEntry?.product?.isActive) {
      return null;
    }

    if (typeof isCrust === "boolean" && sizeEntry.product.isCrust !== isCrust) {
      return null;
    }

    return sizeEntry;
  }
}
