import type { Queryable } from "../db/client";
import { createSandboxProvider, sandboxEnabled } from "./sandbox";
import { createMpesaProvider, mpesaConfig } from "./mpesa";
import type { PaymentProvider, PaymentProviderId } from "./types";
import { PaymentProviderError } from "./types";

export * from "./types";

/** Providers available in this environment, in display order. */
export function availableProviders(db: Queryable): PaymentProvider[] {
  const providers: PaymentProvider[] = [];
  const mpesa = mpesaConfig();
  if (mpesa) providers.push(createMpesaProvider(mpesa));
  if (sandboxEnabled()) providers.push(createSandboxProvider(db));
  return providers;
}

export function getProvider(db: Queryable, id: PaymentProviderId | string): PaymentProvider {
  const p = availableProviders(db).find((x) => x.id === id);
  if (!p) throw new PaymentProviderError(`Payment method ${id} is not available.`);
  return p;
}
