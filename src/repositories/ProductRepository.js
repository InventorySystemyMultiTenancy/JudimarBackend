import { prisma } from "../lib/prisma.js";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WEEKDAY_BY_SHORT_NAME = {
  Sun: "SUN",
  Mon: "MON",
  Tue: "TUE",
  Wed: "WED",
  Thu: "THU",
  Fri: "FRI",
  Sat: "SAT",
};

function getTodayCode() {
  const shortName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(new Date());
  return WEEKDAY_BY_SHORT_NAME[shortName] ?? "SUN";
}

function normalizeAvailableDays(days) {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.filter((day) => WEEKDAYS.includes(day)))];
}

function isAvailableToday(product) {
  const days = product.availableDays ?? [];
  return days.length === 0 || days.includes(getTodayCode());
}

function attachMetadata(product, metaMap) {
  const { stock, stockMinimum, ...rest } = product;
  const meta = metaMap.get(product.id);
  return {
    ...rest,
    category: meta?.category ?? "Geral",
    availableDays: meta?.availableDays ?? [],
    waiterOnly: meta?.waiterOnly ?? false,
    hasPriceVariants: meta?.hasPriceVariants ?? false,
    commercialPrice: meta?.commercialPrice ?? null,
    pratoFeitoPrice: meta?.pratoFeitoPrice ?? null,
  };
}

// Busca metadados via raw SQL (compatível com qualquer versão do Prisma Client)
async function fetchProductMetadata(ids) {
  if (!ids.length) return new Map();
  const rows =
    await prisma.$queryRaw`SELECT "id", "category", "availableDays", "waiterOnly", "hasPriceVariants", "commercialPrice", "pratoFeitoPrice" FROM "Product" WHERE "id" = ANY(${ids})`;
  return new Map(
    rows.map((r) => [
      r.id,
      {
        category: r.category ?? "Geral",
        availableDays: normalizeAvailableDays(r.availableDays),
        waiterOnly: Boolean(r.waiterOnly),
        hasPriceVariants: Boolean(r.hasPriceVariants),
        commercialPrice:
          r.commercialPrice != null ? Number(r.commercialPrice) : null,
        pratoFeitoPrice:
          r.pratoFeitoPrice != null ? Number(r.pratoFeitoPrice) : null,
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
    return products
      .map((p) => attachMetadata(p, metaMap))
      .filter((product) => isAvailableToday(product));
  }

  async findAllForAdmin() {
    const products = await prisma.product.findMany({
      include: { sizes: { orderBy: { size: "asc" } } },
      orderBy: [{ isCrust: "asc" }, { name: "asc" }],
    });
    const metaMap = await fetchProductMetadata(products.map((p) => p.id));
    return products.map((p) => attachMetadata(p, metaMap));
  }

  async create({
    name,
    description,
    imageUrl,
    category,
    availableDays,
    waiterOnly,
    hasPriceVariants,
    commercialPrice,
    pratoFeitoPrice,
    isCrust,
    sizes,
  }) {
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
    const days = normalizeAvailableDays(availableDays);
    await prisma.$executeRaw`
      UPDATE "Product"
      SET
        "category" = ${cat},
        "availableDays" = ${days},
        "waiterOnly" = ${Boolean(waiterOnly)},
        "hasPriceVariants" = ${Boolean(hasPriceVariants)},
        "commercialPrice" = ${hasPriceVariants ? commercialPrice : null},
        "pratoFeitoPrice" = ${hasPriceVariants ? pratoFeitoPrice : null}
      WHERE "id" = ${product.id}
    `;
    const { stock, stockMinimum, ...rest } = product;
    return {
      ...rest,
      category: cat,
      availableDays: days,
      waiterOnly: Boolean(waiterOnly),
      hasPriceVariants: Boolean(hasPriceVariants),
      commercialPrice: hasPriceVariants ? commercialPrice : null,
      pratoFeitoPrice: hasPriceVariants ? pratoFeitoPrice : null,
    };
  }

  async update(
    productId,
    {
      name,
      description,
      imageUrl,
      category,
      availableDays,
      waiterOnly,
      hasPriceVariants,
      commercialPrice,
      pratoFeitoPrice,
      isCrust,
      sizes,
    },
  ) {
    return prisma.$transaction(async (tx) => {
      let resolvedCategory = category;
      let resolvedAvailableDays = availableDays;
      let resolvedWaiterOnly = waiterOnly;
      let resolvedHasPriceVariants = hasPriceVariants;
      let resolvedCommercialPrice = commercialPrice;
      let resolvedPratoFeitoPrice = pratoFeitoPrice;

      await tx.product.update({
        where: { id: productId },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(isCrust !== undefined && { isCrust }),
        },
      });

      if (
        category !== undefined ||
        availableDays !== undefined ||
        waiterOnly !== undefined ||
        hasPriceVariants !== undefined ||
        commercialPrice !== undefined ||
        pratoFeitoPrice !== undefined
      ) {
        const existingRow = await tx.$queryRaw`
          SELECT "category", "availableDays", "waiterOnly", "hasPriceVariants", "commercialPrice", "pratoFeitoPrice"
          FROM "Product"
          WHERE "id" = ${productId}
        `;
        const current = existingRow?.[0] ?? {};
        resolvedCategory = category ?? current.category ?? "Geral";
        resolvedAvailableDays =
          availableDays !== undefined
            ? normalizeAvailableDays(availableDays)
            : normalizeAvailableDays(current.availableDays);
        resolvedWaiterOnly =
          waiterOnly !== undefined ? Boolean(waiterOnly) : current.waiterOnly;
        resolvedHasPriceVariants =
          hasPriceVariants !== undefined
            ? Boolean(hasPriceVariants)
            : Boolean(current.hasPriceVariants);
        resolvedCommercialPrice =
          commercialPrice !== undefined
            ? commercialPrice
            : current.commercialPrice != null
              ? Number(current.commercialPrice)
              : null;
        resolvedPratoFeitoPrice =
          pratoFeitoPrice !== undefined
            ? pratoFeitoPrice
            : current.pratoFeitoPrice != null
              ? Number(current.pratoFeitoPrice)
              : null;
        await tx.$executeRaw`
          UPDATE "Product"
          SET
            "category" = ${resolvedCategory},
            "availableDays" = ${resolvedAvailableDays},
            "waiterOnly" = ${Boolean(resolvedWaiterOnly)},
            "hasPriceVariants" = ${Boolean(resolvedHasPriceVariants)},
            "commercialPrice" = ${resolvedHasPriceVariants ? resolvedCommercialPrice : null},
            "pratoFeitoPrice" = ${resolvedHasPriceVariants ? resolvedPratoFeitoPrice : null}
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
        availableDays:
          resolvedAvailableDays ?? updated?.availableDays ?? [],
        waiterOnly: resolvedWaiterOnly ?? updated?.waiterOnly ?? false,
        hasPriceVariants:
          resolvedHasPriceVariants ?? updated?.hasPriceVariants ?? false,
        commercialPrice:
          resolvedHasPriceVariants ? resolvedCommercialPrice : null,
        pratoFeitoPrice:
          resolvedHasPriceVariants ? resolvedPratoFeitoPrice : null,
      };
    });
  }

  async setActive(productId, isActive) {
    return prisma.product.update({
      where: { id: productId },
      data: { isActive },
    });
  }

  async deletePermanent(productId) {
    return prisma.$transaction(async (tx) => {
      const orderItemsCount = await tx.orderItem.count({
        where: { productId },
      });

      if (orderItemsCount > 0) {
        const error = new Error("PRODUCT_HAS_HISTORY");
        error.code = "PRODUCT_HAS_HISTORY";
        throw error;
      }

      await tx.productSize.deleteMany({ where: { productId } });
      return tx.product.delete({ where: { id: productId } });
    });
  }

  async findByIdWithSizes(productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { sizes: true },
    });
    if (!product) return null;
    const metaMap = await fetchProductMetadata([productId]);
    return attachMetadata(product, metaMap);
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
      .map((product) => ({
        ...attachMetadata(product, metaMap),
        soldCount: soldCountById.get(product.id) ?? 0,
      }))
      .filter((product) => isAvailableToday(product));
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
