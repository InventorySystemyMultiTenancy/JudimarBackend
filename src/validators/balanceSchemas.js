import { z } from "zod";

const money = z.coerce.number().finite().min(0).max(9999999999.99);

export const balancePeriodSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
});

export const saveMonthlyBalanceSchema = balancePeriodSchema.extend({
  cardFees: money.default(0),
  deliveryFees: money.default(0),
  taxes: money.default(0),
  discounts: money.default(0),
  initialInventory: money.default(0),
  purchases: money.default(0),
  finalInventory: money.default(0),
  fixedExpenses: money.default(0),
  variableExpenses: money.default(0),
  payrollExpenses: money.default(0),
  marketingExpenses: money.default(0),
  otherExpenses: money.default(0),
  notes: z.string().trim().max(2000).optional().default(""),
});
