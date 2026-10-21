import { applyBps } from "@/lib/money";

export type PricingModel = "per_person" | "per_group";

export interface DiscountRule {
  id: string;
  minTravellers: number;
  percentOffBps: number;
}

/** A line priced exclusively from trusted catalogue data loaded on the server. */
export interface PriceableLine {
  key: string;
  title: string;
  pricingModel: PricingModel;
  currency: string;
  basePriceMinor: number;
  childPriceMinor: number | null;
  adults: number;
  children: number;
  discountRules: DiscountRule[];
}

export interface PricedLine {
  key: string;
  title: string;
  pricingModel: PricingModel;
  unitPriceMinor: number;
  quantityLabel: string;
  grossMinor: number;
  discountMinor: number;
  discountRuleId: string | null;
  totalMinor: number;
}

export interface PricingSettings {
  currency: string;
  serviceFeeBps: number;
  taxBps: number;
}

export interface Quote {
  currency: string;
  lines: PricedLine[];
  subtotalMinor: number;
  discountMinor: number;
  serviceFeeMinor: number;
  serviceFeeBps: number;
  taxMinor: number;
  taxBps: number;
  totalMinor: number;
}

export class PricingError extends Error {}

export function priceLine(line: PriceableLine): PricedLine {
  if (line.adults < 0 || line.children < 0 || line.adults + line.children < 1) {
    throw new PricingError(`${line.title}: at least one traveller is required`);
  }
  if (!Number.isInteger(line.basePriceMinor) || line.basePriceMinor < 0) {
    throw new PricingError(`${line.title}: invalid price`);
  }

  let gross: number;
  let quantityLabel: string;
  if (line.pricingModel === "per_person") {
    const childPrice = line.childPriceMinor ?? line.basePriceMinor;
    gross = line.adults * line.basePriceMinor + line.children * childPrice;
    quantityLabel =
      line.children > 0 ? `${line.adults} adult${line.adults === 1 ? "" : "s"}, ${line.children} child${line.children === 1 ? "" : "ren"}` : `${line.adults} × person`;
  } else {
    gross = line.basePriceMinor;
    quantityLabel = "per group";
  }

  const party = line.adults + line.children;
  const best = line.discountRules
    .filter((r) => party >= r.minTravellers)
    .sort((a, b) => b.percentOffBps - a.percentOffBps)[0];
  const discount = best ? applyBps(gross, best.percentOffBps) : 0;

  return {
    key: line.key,
    title: line.title,
    pricingModel: line.pricingModel,
    unitPriceMinor: line.basePriceMinor,
    quantityLabel,
    grossMinor: gross,
    discountMinor: discount,
    discountRuleId: best?.id ?? null,
    totalMinor: gross - discount,
  };
}

export function priceQuote(lines: PriceableLine[], settings: PricingSettings): Quote {
  for (const l of lines) {
    if (l.currency !== settings.currency) {
      throw new PricingError(`${l.title} is priced in ${l.currency}; this trip is quoted in ${settings.currency}`);
    }
  }
  const priced = lines.map(priceLine);
  const subtotal = priced.reduce((s, l) => s + l.grossMinor, 0);
  const discount = priced.reduce((s, l) => s + l.discountMinor, 0);
  const net = subtotal - discount;
  const serviceFee = applyBps(net, settings.serviceFeeBps);
  const tax = applyBps(net + serviceFee, settings.taxBps);
  return {
    currency: settings.currency,
    lines: priced,
    subtotalMinor: subtotal,
    discountMinor: discount,
    serviceFeeMinor: serviceFee,
    serviceFeeBps: settings.serviceFeeBps,
    taxMinor: tax,
    taxBps: settings.taxBps,
    totalMinor: net + serviceFee + tax,
  };
}
