import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { DeliveryService } from "../src/services/DeliveryService.js";

vi.mock("axios", () => ({
  default: vi.fn(),
}));

const normalizeCurrency = (value) => value.replace(/\s/g, " ");

describe("DeliveryService", () => {
  beforeEach(() => {
    axios.mockReset();
  });

  it("deve zerar o frete quando a distancia for ate 5 km", async () => {
    axios
      .mockResolvedValueOnce({
        data: [
          {
            lat: "-23.53",
            lon: "-46.50",
            display_name: "Endereco teste",
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          code: "Ok",
          routes: [{ distance: 5000, duration: 900 }],
        },
      });

    const result = await new DeliveryService().calculateFreight({
      cep: "03551-000",
      numero: "17",
      cidade: "Sao Paulo",
      rua: "Avenida Cachoeira Paulista",
    });

    expect(result.distanciaKm).toBe(5);
    expect(result.valorFreteNumerico).toBe(0);
    expect(normalizeCurrency(result.valorFrete)).toBe("R$ 0,00");
    expect(result.freteGratisPorDistancia).toBe(true);
  });

  it("deve cobrar frete acima de 5 km", async () => {
    axios
      .mockResolvedValueOnce({
        data: [
          {
            lat: "-23.58",
            lon: "-46.62",
            display_name: "Endereco teste",
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          code: "Ok",
          routes: [{ distance: 6100, duration: 1200 }],
        },
      });

    const result = await new DeliveryService().calculateFreight({
      cep: "01001-000",
      numero: "100",
      cidade: "Sao Paulo",
      rua: "Rua Teste",
    });

    expect(result.distanciaKm).toBe(6.1);
    expect(result.valorFreteNumerico).toBe(17.2);
    expect(normalizeCurrency(result.valorFrete)).toBe("R$ 17,20");
    expect(result.freteGratisPorDistancia).toBe(false);
  });
});
