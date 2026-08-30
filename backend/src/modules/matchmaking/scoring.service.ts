import { Injectable } from '@nestjs/common';

// docs/05: "Malzeme fiyat referansları MVP'de sabit tablo; ileride piyasa verisine
// bağlanabilir" -- kaynak dokümanlarda hiçbir sayı verilmediği için burada makul,
// açıkça yer tutucu değerler var. AD2 kalibrasyonundan önce gerçek sayı sayılmamalı.
const MATERIAL_PRICES_EUR_PER_KG: Record<string, { virgin: number; secondary: number }> = {
  METAL: { virgin: 2.5, secondary: 1.2 },
  PLASTIC: { virgin: 1.8, secondary: 0.7 },
  ORGANIC: { virgin: 0.4, secondary: 0.1 },
  CHEMICAL: { virgin: 3.0, secondary: 1.5 },
  TEXTILE: { virgin: 2.2, secondary: 0.9 },
  GLASS: { virgin: 0.3, secondary: 0.12 },
  PAPER: { virgin: 0.6, secondary: 0.2 },
  OTHER: { virgin: 1.0, secondary: 0.4 },
};

// Aynı sebeple yer tutucu -- gerçek nakliye maliyeti kalibrasyon ister (AD2)
const TRANSPORT_COST_EUR_PER_KG_KM = 0.002;

export interface CarbonFactors {
  virgin: number; // kg CO2e / kg
  secondary: number; // kg CO2e / kg
}

@Injectable()
export class ScoringService {
  // Malzeme skoru (%30): anlamsal benzerlik, miktar uyumsuzluğuyla cezalandırılır (E2)
  materialScore(similarity: number, supplyKg: number, demandKg: number): { score: number; quantityRatio: number } {
    const similarityScore = ((similarity - 0.6) / 0.4) * 100;
    const quantityRatio = Math.min(supplyKg, demandKg) / Math.max(supplyKg, demandKg);
    const penalty = quantityRatio < 0.2 ? 30 : 0;
    return { score: similarityScore - penalty, quantityRatio };
  }

  // Kalite skoru (%20): inputs.specs kriterlerinin outputs.composition tarafından
  // karşılanma oranı. specs boşsa 70 (bilinmezliği ne ödüllendirir ne cezalandırır).
  // Not: "karşılanma" burada anahtar varlığı olarak yorumlanıyor -- specs/composition
  // serbest biçimli JSON olduğu için sayısal eşik karşılaştırması dokümanlarda tanımlı değil.
  qualityScore(specs: Record<string, unknown> | null | undefined, composition: Record<string, number> | null | undefined): number {
    const criteria = specs ? Object.keys(specs) : [];
    if (criteria.length === 0) {
      return 70;
    }
    const compositionKeys = new Set(Object.keys(composition ?? {}));
    const satisfied = criteria.filter((key) => compositionKeys.has(key)).length;
    return (satisfied / criteria.length) * 100;
  }

  // Çevresel skor (%20): önlenen CO2'nin birincil hammadde emisyonuna oranı
  environmentalScore(factors: CarbonFactors): number {
    if (factors.virgin <= 0) return 0;
    const netReduction = factors.virgin - factors.secondary;
    return (netReduction / factors.virgin) * 100;
  }

  // Lojistik skoru (%15): mesafe arttıkça doğrusal düşer, 250 km'de sıfır. Konum
  // yoksa 0 -- hata değil, ceza (E6)
  logisticsScore(distanceKm: number | null): number {
    if (distanceKm === null) return 0;
    return Math.max(0, 100 - (distanceKm / 250) * 100);
  }

  // Ekonomik skor (%15): nakliye düşüldükten sonraki net tasarruf oranı
  economicScore(materialClass: string, matchedQty: number, distanceKm: number | null): number {
    const prices = MATERIAL_PRICES_EUR_PER_KG[materialClass] ?? MATERIAL_PRICES_EUR_PER_KG.OTHER;
    const grossSaving = (prices.virgin - prices.secondary) * matchedQty;
    if (grossSaving <= 0) return 0;
    const transport = (distanceKm ?? 0) * matchedQty * TRANSPORT_COST_EUR_PER_KG_KM;
    const ratio = ((grossSaving - transport) / grossSaving) * 100;
    return Math.min(100, Math.max(0, ratio));
  }

  totalScore(factors: { material: number; quality: number; environmental: number; logistics: number; economic: number }, weights: { material: number; quality: number; environmental: number; logistics: number; economic: number }): number {
    const raw =
      factors.material * weights.material +
      factors.quality * weights.quality +
      factors.environmental * weights.environmental +
      factors.logistics * weights.logistics +
      factors.economic * weights.economic;
    return Math.round(Math.min(100, Math.max(0, raw)));
  }

  // CBAM: docs/05 -- carbon_factors.co2_per_kg kg CO2e/kg cinsinden, ton başına değil
  cbam(factors: CarbonFactors, matchedQty: number, carbonPriceEurPerTon: number) {
    const netReduction = factors.virgin - factors.secondary;
    const co2SavedKg = netReduction * matchedQty;
    const cbamSavingEur = (co2SavedKg / 1000) * carbonPriceEurPerTon;
    return { co2SavedKg, cbamSavingEur };
  }

  costSaving(materialClass: string, matchedQty: number, distanceKm: number | null): number {
    const prices = MATERIAL_PRICES_EUR_PER_KG[materialClass] ?? MATERIAL_PRICES_EUR_PER_KG.OTHER;
    const grossSaving = (prices.virgin - prices.secondary) * matchedQty;
    const transport = (distanceKm ?? 0) * matchedQty * TRANSPORT_COST_EUR_PER_KG_KM;
    return Math.max(0, grossSaving - transport);
  }
}
