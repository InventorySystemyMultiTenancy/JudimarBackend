import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { ComandaRepository } from "../repositories/ComandaRepository.js";

export class ComandaService {
  constructor(comandaRepository = new ComandaRepository()) {
    this.comandaRepository = comandaRepository;
  }

  async create({ name, number, isActive }, user = null) {
    const createdByRole = user?.role ?? null;
    const isTemporary = createdByRole === "ATENDENTE";

    try {
      return await this.comandaRepository.create({
        name,
        number,
        ...(isActive !== undefined ? { isActive } : {}),
        isTemporary,
        createdByRole,
        createdByUserId: user?.id ?? null,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError("Numero de comanda ja cadastrado.", 409);
      }
      throw err;
    }
  }

  async listAll() {
    return this.comandaRepository.findAll();
  }

  async openTotals() {
    return this.comandaRepository.findAllOpenTotals();
  }

  async update(id, data) {
    const comanda = await this.comandaRepository.findById(id);
    if (!comanda) throw new AppError("Comanda nao encontrada.", 404);

    try {
      return await this.comandaRepository.update(id, data);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError("Numero de comanda ja cadastrado.", 409);
      }
      throw err;
    }
  }

  async delete(id) {
    const comanda = await this.comandaRepository.findById(id);
    if (!comanda) throw new AppError("Comanda nao encontrada.", 404);
    return this.comandaRepository.delete(id);
  }

  async cleanupTemporaryCreatedBefore(cutoff) {
    return this.comandaRepository.cleanupTemporaryCreatedBefore(cutoff);
  }

  async regenerateToken(id) {
    const comanda = await this.comandaRepository.findById(id);
    if (!comanda) throw new AppError("Comanda nao encontrada.", 404);
    return this.comandaRepository.update(id, { accessToken: randomUUID() });
  }

  async getOrdersToday(id) {
    const comanda = await this.comandaRepository.findById(id);
    if (!comanda) throw new AppError("Comanda nao encontrada.", 404);
    return this.comandaRepository.findOrdersToday(id);
  }

  async getSummaryByToken(token) {
    const summary = await this.comandaRepository.findSummaryByToken(token);
    if (!summary || !summary.comanda?.isActive) {
      throw new AppError("Comanda nao encontrada ou inativa.", 404);
    }
    return summary;
  }
}
