import { AppError } from "../errors/AppError.js";
import { ProductRepository } from "../repositories/ProductRepository.js";
import { PurchaseListRepository } from "../repositories/PurchaseListRepository.js";

// Schema version: product.category field added (v2)

export class ProductService {
  constructor(
    productRepository = new ProductRepository(),
    purchaseListRepository = new PurchaseListRepository(),
  ) {
    this.productRepository = productRepository;
    this.purchaseListRepository = purchaseListRepository;
  }

  async listProducts() {
    return this.productRepository.findAll();
  }

  async listProductsForAdmin() {
    return this.productRepository.findAllForAdmin();
  }

  async listTopSellingProducts(limit = 6) {
    return this.productRepository.findTopSelling(limit);
  }

  async createProduct(data) {
    return this.productRepository.create(data);
  }

  async updateProduct(productId, data) {
    const existing = await this.productRepository.findByIdWithSizes(productId);
    if (!existing) throw new AppError("Produto nao encontrado.", 404);
    return this.productRepository.update(productId, data);
  }

  async deactivateProduct(productId) {
    const existing = await this.productRepository.findByIdWithSizes(productId);
    if (!existing) throw new AppError("Produto nao encontrado.", 404);
    return this.productRepository.setActive(productId, false);
  }

  async bulkAdjustStock(items, type) {
    if (!items?.length) throw new AppError("Nenhum item informado.", 422);
    const VALID_TYPES = ["ENTRADA", "SAIDA"];
    if (!VALID_TYPES.includes(type))
      throw new AppError("Tipo deve ser ENTRADA ou SAIDA.", 422);
    for (const item of items) {
      if (
        !item.productId ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      )
        throw new AppError("Quantidade deve ser inteiro positivo.", 422);
    }
    return this.productRepository.bulkAdjustStock(items, type);
  }

  async restoreProduct(productId) {
    return this.productRepository.setActive(productId, true);
  }

  async getProductById(productId) {
    const product = await this.productRepository.findByIdWithSizes(productId);

    if (!product) {
      throw new AppError("Produto nao encontrado.", 404);
    }

    return product;
  }

  async createPendingPurchaseList({ items, observation, createdBy }) {
    if (!Array.isArray(items) || !items.length) {
      throw new AppError("Selecione ao menos um produto.", 422);
    }

    const parsedItems = items
      .map((item) => ({
        productId: String(item.productId ?? "").trim(),
        quantity: Number(item.quantity),
      }))
      .filter((item) => item.productId && Number.isInteger(item.quantity));

    if (!parsedItems.length || parsedItems.some((item) => item.quantity <= 0)) {
      throw new AppError("As quantidades devem ser inteiros positivos.", 422);
    }

    return this.purchaseListRepository.createPendingList({
      items: parsedItems,
      observation: observation?.trim() || null,
      createdBy: createdBy || null,
    });
  }

  async listPendingPurchaseLists() {
    return this.purchaseListRepository.listPendingLists();
  }

  async confirmPendingPurchaseList(listId) {
    const result = await this.purchaseListRepository.confirmPendingList(listId);
    if (!result) {
      throw new AppError("Lista pendente nao encontrada.", 404);
    }
    return result;
  }
}
