import { z } from "zod";

const sizeSchema = z.object({
  size: z.enum(["PEQUENA", "MEDIA", "GRANDE", "FAMILIA"]),
  price: z.number().positive("Preco deve ser positivo"),
  costPrice: z.number().nonnegative("Custo deve ser positivo").optional(),
});

const availableDaySchema = z.enum([
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
]);

const validatePriceVariants = (data, ctx) => {
    if (!data.hasPriceVariants) return;
    if (data.commercialPrice == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o preco comercial.",
        path: ["commercialPrice"],
      });
    }
    if (data.pratoFeitoPrice == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o preco do prato feito.",
        path: ["pratoFeitoPrice"],
      });
    }
};

export const createProductSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(100),
  description: z.string().max(300).optional(),
  imageUrl: z
    .string()
    .url("URL de imagem invalida")
    .optional()
    .or(z.literal("")),
  category: z.string().max(50).optional(),
  availableDays: z.array(availableDaySchema).optional(),
  waiterOnly: z.boolean().optional(),
  hasPriceVariants: z.boolean().optional(),
  commercialPrice: z.number().positive("Preco comercial deve ser positivo").optional(),
  pratoFeitoPrice: z.number().positive("Preco do prato feito deve ser positivo").optional(),
  isCrust: z.boolean().optional(),
  sizes: z.array(sizeSchema).min(1, "Informe ao menos um tamanho com preco"),
}).superRefine(validatePriceVariants);

export const updateProductSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(300).optional(),
  imageUrl: z
    .string()
    .url("URL de imagem invalida")
    .optional()
    .or(z.literal("")),
  category: z.string().max(50).optional(),
  availableDays: z.array(availableDaySchema).optional(),
  waiterOnly: z.boolean().optional(),
  hasPriceVariants: z.boolean().optional(),
  commercialPrice: z.number().positive("Preco comercial deve ser positivo").nullable().optional(),
  pratoFeitoPrice: z.number().positive("Preco do prato feito deve ser positivo").nullable().optional(),
  isCrust: z.boolean().optional(),
  sizes: z.array(sizeSchema).min(1).optional(),
}).superRefine(validatePriceVariants);
