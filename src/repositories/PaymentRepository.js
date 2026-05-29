import { prisma } from "../lib/prisma.js";

export class PaymentRepository {
  async updateAmount(orderId, amount) {
    return prisma.$executeRaw`
      UPDATE "Payment"
      SET amount = ${Number(amount).toFixed(2)}::decimal,
          "updatedAt" = NOW()
      WHERE "orderId" = ${orderId}
    `;
  }

  async upsertFromWebhook({ orderId, externalId, status, payload, amount }) {
    return prisma.payment.upsert({
      where: { orderId },
      update: {
        externalId,
        status,
        payload,
        ...(amount ? { amount } : {}),
      },
      create: {
        orderId,
        provider: "MERCADO_PAGO",
        externalId,
        status,
        amount,
        payload,
      },
    });
  }
}
