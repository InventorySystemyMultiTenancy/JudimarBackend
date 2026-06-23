import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const decimal = (value) => new Prisma.Decimal(value);

const serializeBalance = (balance) => {
  if (!balance) return null;

  return Object.fromEntries(
    Object.entries(balance).map(([key, value]) => [
      key,
      value instanceof Prisma.Decimal ? Number(value) : value,
    ]),
  );
};

export class BalanceService {
  async getGrossRevenue(month, year) {
    const monthText = String(month).padStart(2, "0");
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthText = String(nextMonth).padStart(2, "0");
    const startDate = new Date(`${year}-${monthText}-01T00:00:00-03:00`);
    const endDate = new Date(
      `${nextYear}-${nextMonthText}-01T00:00:00-03:00`,
    );

    const result = await prisma.order.aggregate({
      where: {
        paymentStatus: "APROVADO",
        status: { not: "CANCELADO" },
        createdAt: { gte: startDate, lt: endDate },
      },
      _sum: { total: true },
    });

    return Number(result._sum.total ?? 0);
  }

  async getMonthlyBalance(month, year) {
    const [savedBalance, grossRevenue] = await Promise.all([
      prisma.monthlyBalance.findUnique({
        where: { month_year: { month, year } },
      }),
      this.getGrossRevenue(month, year),
    ]);
    const balance = serializeBalance(savedBalance) ?? {
      month,
      year,
      cardFees: 0,
      deliveryFees: 0,
      taxes: 0,
      discounts: 0,
      initialInventory: 0,
      purchases: 0,
      finalInventory: 0,
      fixedExpenses: 0,
      variableExpenses: 0,
      payrollExpenses: 0,
      marketingExpenses: 0,
      otherExpenses: 0,
      notes: "",
    };
    const deductions =
      Number(balance.cardFees) +
      Number(balance.deliveryFees) +
      Number(balance.taxes) +
      Number(balance.discounts);
    const netRevenue = grossRevenue - deductions;
    const cmv = Math.max(
      0,
      Number(balance.initialInventory) +
        Number(balance.purchases) -
        Number(balance.finalInventory),
    );
    const totalExpenses =
      cmv +
      Number(balance.fixedExpenses) +
      Number(balance.variableExpenses) +
      Number(balance.payrollExpenses) +
      Number(balance.marketingExpenses) +
      Number(balance.otherExpenses);

    return {
      ...balance,
      grossRevenue,
      netRevenue,
      cmv,
      totalExpenses,
      netProfit: netRevenue - totalExpenses,
    };
  }

  async saveMonthlyBalance(payload) {
    const grossRevenue = await this.getGrossRevenue(payload.month, payload.year);
    const deductions =
      payload.cardFees +
      payload.deliveryFees +
      payload.taxes +
      payload.discounts;
    const netRevenue = grossRevenue - deductions;
    const cmv = Math.max(
      0,
      payload.initialInventory + payload.purchases - payload.finalInventory,
    );
    const operatingExpenses =
      payload.fixedExpenses +
      payload.variableExpenses +
      payload.payrollExpenses +
      payload.marketingExpenses +
      payload.otherExpenses;
    const totalExpenses = cmv + operatingExpenses;
    const netProfit = netRevenue - totalExpenses;

    const data = {
      grossRevenue: decimal(grossRevenue),
      cardFees: decimal(payload.cardFees),
      deliveryFees: decimal(payload.deliveryFees),
      taxes: decimal(payload.taxes),
      discounts: decimal(payload.discounts),
      netRevenue: decimal(netRevenue),
      initialInventory: decimal(payload.initialInventory),
      purchases: decimal(payload.purchases),
      finalInventory: decimal(payload.finalInventory),
      cmv: decimal(cmv),
      fixedExpenses: decimal(payload.fixedExpenses),
      variableExpenses: decimal(payload.variableExpenses),
      payrollExpenses: decimal(payload.payrollExpenses),
      marketingExpenses: decimal(payload.marketingExpenses),
      otherExpenses: decimal(payload.otherExpenses),
      totalExpenses: decimal(totalExpenses),
      netProfit: decimal(netProfit),
      notes: payload.notes || null,
    };

    const balance = await prisma.monthlyBalance.upsert({
      where: {
        month_year: { month: payload.month, year: payload.year },
      },
      update: data,
      create: {
        month: payload.month,
        year: payload.year,
        ...data,
      },
    });

    return serializeBalance(balance);
  }

  async deleteMonthlyBalance(month, year) {
    return prisma.monthlyBalance.deleteMany({ where: { month, year } });
  }
}
