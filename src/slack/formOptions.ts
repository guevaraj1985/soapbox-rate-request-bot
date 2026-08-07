import type { B3plTier, Carrier, RequestType, SbTier, ServiceModel } from "../types.js";

export const requestTypes: RequestType[] = ["Soapbox", "B3PL"];
export const carriers: Carrier[] = ["FedEx", "UPS", "USPS"];
export const serviceModels: ServiceModel[] = ["Soapbox Shipping Rates", "WMS OR API", "Basic3PL"];

export const sbTierDetails: Record<SbTier, { ups?: string; fedex?: string; usps?: string }> = {
  "3PL Partner (T0)": { fedex: "5%", ups: "5%", usps: "0%" },
  "Marketplace (T1)": { fedex: "10%", ups: "10%", usps: "1%" },
  "Reseller (T2)": { fedex: "15%", ups: "15%", usps: "2%" },
  "Enterprise (T3)": { fedex: "20%", ups: "20%", usps: "3%" },
  "MM (T4)": { fedex: "25%", ups: "25%", usps: "4%" },
  "SMB (T5)": { fedex: "30%", ups: "30%", usps: "5%" }
};

export const sbTiers = Object.keys(sbTierDetails) as SbTier[];

const legacySbTierMap: Record<string, SbTier> = {
  "SB Tier 0": "3PL Partner (T0)",
  "SB Tier 1": "Marketplace (T1)",
  "SB Tier 2": "Reseller (T2)",
  "SB Tier 3": "Enterprise (T3)",
  "SB Tier 4": "MM (T4)",
  "SB Tier 5": "SMB (T5)"
};

export const b3plTierDetails: Record<B3plTier, { servicesUplift: string; shippingUplift: string }> = {
  "Self Service": { servicesUplift: "80%", shippingUplift: "30%" },
  "SB Direct": { servicesUplift: "65%", shippingUplift: "30%" },
  Commercial: { servicesUplift: "50%", shippingUplift: "30%" },
  Enterprise: { servicesUplift: "40%", shippingUplift: "20%" },
  Wholesale: { servicesUplift: "30%", shippingUplift: "20%" }
};

export const b3plTiers = Object.keys(b3plTierDetails) as B3plTier[];

export function sbTierSummary(tier?: SbTier | null) {
  if (!tier) return "";
  const details = sbTierDetails[tier];
  const carrierDetails = [
    details.fedex ? `FedEx ${details.fedex}` : undefined,
    details.ups ? `UPS ${details.ups}` : undefined,
    details.usps ? `USPS ${details.usps}` : undefined
  ].filter(Boolean).join(" / ");
  return carrierDetails ? `${tier} - ${carrierDetails}` : tier;
}

export function b3plTierSummary(tier?: B3plTier | null) {
  if (!tier) return "";
  const details = b3plTierDetails[tier];
  return `${tier} (${details.servicesUplift} services / ${details.shippingUplift} shipping)`;
}

export function normalizeSbTier(value?: string | null): SbTier | undefined {
  if (!value) return undefined;
  if (sbTiers.includes(value as SbTier)) return value as SbTier;
  return legacySbTierMap[value];
}

export function isRequestType(value: string): value is RequestType {
  return requestTypes.includes(value as RequestType);
}

export function isCarrier(value: string): value is Carrier {
  return carriers.includes(value as Carrier);
}

export function isServiceModel(value: string): value is ServiceModel {
  return serviceModels.includes(value as ServiceModel);
}

export function isSbTier(value: string): value is SbTier {
  return Boolean(normalizeSbTier(value));
}

export function isB3plTier(value: string): value is B3plTier {
  return b3plTiers.includes(value as B3plTier);
}

