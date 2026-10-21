import { AuthRequiredError, ForbiddenError, NotFoundError } from "@/domain/authz";
import { InvalidTransitionError } from "@/domain/states";
import { PricingError } from "@/domain/pricing";

/** An error whose message is safe and useful to show to the user. */
export class UserError extends Error {
  readonly status = 400;
}

export class ConflictError extends Error {
  readonly status = 409;
}

/** Maps any thrown error to a safe, user-facing message. Unknown errors are logged, never leaked. */
export function toUserMessage(err: unknown): string {
  if (
    err instanceof UserError ||
    err instanceof ConflictError ||
    err instanceof ForbiddenError ||
    err instanceof NotFoundError ||
    err instanceof AuthRequiredError ||
    err instanceof PricingError
  ) {
    return err.message;
  }
  if (err instanceof Error && "status" in err && err.status === 429) return err.message;
  if (err instanceof InvalidTransitionError) return "This action isn't available in the current state. Please refresh and try again.";
  console.error("[unexpected]", err);
  return "Something went wrong. Please try again.";
}

export function isPgError(err: unknown, code: string): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === code;
}
