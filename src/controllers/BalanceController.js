import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";
import { BalanceService } from "../services/BalanceService.js";
import {
  balancePeriodSchema,
  saveMonthlyBalanceSchema,
} from "../validators/balanceSchemas.js";

const balanceService = new BalanceService();

export class BalanceController {
  async getMonthly(req, res, next) {
    try {
      const { month, year } = balancePeriodSchema.parse(req.query);
      const balance = await balanceService.getMonthlyBalance(month, year);
      return res.status(200).json({ data: balance });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async saveMonthly(req, res, next) {
    try {
      const payload = saveMonthlyBalanceSchema.parse(req.body);
      const balance = await balanceService.saveMonthlyBalance(payload);
      return res.status(200).json({
        message: "Balanço mensal salvo com sucesso.",
        data: balance,
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async deleteMonthly(req, res, next) {
    try {
      const { month, year } = balancePeriodSchema.parse(req.query);
      await balanceService.deleteMonthlyBalance(month, year);
      return res.status(200).json({
        message: "Balanço mensal removido com sucesso.",
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  #handleError(error, next) {
    if (error instanceof ZodError) {
      return next(new AppError("Dados do balanço inválidos.", 422, error.flatten()));
    }
    return next(error);
  }
}
