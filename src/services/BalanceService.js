import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const decimal = (value) => new Prisma.Decimal(value);

export class BalanceService {
  async getMonthlyBalance(month, year) {
    return prisma.monthlyBalance.findUnique({
      where: { month_year: { month, year } },
    });
  }

  async saveMonthlyBalance(payload) {
    const deductions =
      payload.cardFees +
      payload.deliveryFees +
      payload.taxes +
      payload.discounts;
    const netRevenue = payload.grossRevenue - deductions;
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
      grossRevenue: decimal(payload.grossRevenue),
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

    return prisma.monthlyBalance.upsert({
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
  }

  async deleteMonthlyBalance(month, year) {
    return prisma.monthlyBalance.deleteMany({ where: { month, year } });
  }
}
