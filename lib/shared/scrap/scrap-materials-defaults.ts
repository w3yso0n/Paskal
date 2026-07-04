import type { ScrapMaterialConfig, ScrapMaterialsConfig } from "./scrap-types"

/** Catálogo inicial (lógica Excel; kg mensuales NO incluidos). */
export const DEFAULT_SCRAP_MATERIALS: ScrapMaterialConfig[] = [
  {
    sourceKey: "scrap-metal",
    name: "Metal",
    family: "metal",
    costPerKgMxn: 20.2,
    scrapSalePricePerKgMxn: 2.5,
    active: true,
  },
  {
    sourceKey: "scrap-twine",
    name: "Twine / Rafia",
    family: "twine",
    costPerKgMxn: 56.63,
    scrapSalePricePerKgMxn: 4.0,
    active: true,
  },
  {
    sourceKey: "scrap-metal-hook-5122",
    name: "Hook 5122",
    family: "metal",
    costPerKgMxn: 20.2,
    scrapSalePricePerKgMxn: 2.5,
    weightPerPieceKg: 0.022,
    active: true,
  },
  {
    sourceKey: "scrap-metal-deacero-122",
    name: "DEACERO metal 122",
    family: "metal",
    costPerKgMxn: 20.2,
    scrapSalePricePerKgMxn: 2.5,
    active: true,
  },
  {
    sourceKey: "scrap-twine-rafia-blanca-1500",
    name: "Rafia blanca 1500",
    family: "twine",
    costPerKgMxn: 56.63,
    scrapSalePricePerKgMxn: 4.0,
    active: true,
  },
  {
    sourceKey: "scrap-twine-rafia-verde-1200",
    name: "Rafia verde 1200",
    family: "twine",
    costPerKgMxn: 56.63,
    scrapSalePricePerKgMxn: 4.0,
    active: true,
  },
  {
    sourceKey: "scrap-twine-rafia-amarilla-1500",
    name: "Rafia amarilla 1500",
    family: "twine",
    costPerKgMxn: 56.63,
    scrapSalePricePerKgMxn: 4.0,
    active: true,
  },
  {
    sourceKey: "scrap-twine-rafia-blanca-1200",
    name: "Rafia blanca 1200",
    family: "twine",
    costPerKgMxn: 56.63,
    scrapSalePricePerKgMxn: 4.0,
    active: true,
  },
  {
    sourceKey: "scrap-twine-rafia-azul-1200",
    name: "Rafia azul 1200",
    family: "twine",
    costPerKgMxn: 56.63,
    scrapSalePricePerKgMxn: 4.0,
    active: true,
  },
]

export function defaultScrapMaterialsConfig(): ScrapMaterialsConfig {
  return { materials: DEFAULT_SCRAP_MATERIALS.map((m) => ({ ...m })) }
}
