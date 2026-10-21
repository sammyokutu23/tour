/**
 * Authorization policies. Pure functions over an Actor so they are unit-testable; services call
 * them with data loaded on the server. Default is deny.
 */

export const ROLES = ["traveller", "guide", "operator", "admin", "support"] as const;
export type Role = (typeof ROLES)[number];

export interface Actor {
  userId: string;
  roles: Role[];
  /** The provider profile owned by this user, if any. */
  providerId: string | null;
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found.") {
    super(message);
  }
}

export class AuthRequiredError extends Error {
  readonly status = 401;
  constructor(message = "Please sign in to continue.") {
    super(message);
  }
}

export const hasRole = (actor: Actor | null, role: Role) => !!actor?.roles.includes(role);
export const isAdmin = (actor: Actor | null) => hasRole(actor, "admin");
export const isStaff = (actor: Actor | null) => hasRole(actor, "admin") || hasRole(actor, "support");
export const isProvider = (actor: Actor | null) => !!actor?.providerId && (hasRole(actor, "guide") || hasRole(actor, "operator"));

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new AuthRequiredError();
  return actor;
}

export function requireAdmin(actor: Actor | null): Actor {
  const a = requireActor(actor);
  if (!isAdmin(a)) throw new ForbiddenError();
  return a;
}

export function requireStaff(actor: Actor | null): Actor {
  const a = requireActor(actor);
  if (!isStaff(a)) throw new ForbiddenError();
  return a;
}

export function requireProvider(actor: Actor | null): Actor & { providerId: string } {
  const a = requireActor(actor);
  if (!isProvider(a)) throw new ForbiddenError("A provider profile is required.");
  return a as Actor & { providerId: string };
}

/** Trips are private to their owner. Staff do not get blanket access to drafts. */
export function canViewTrip(actor: Actor | null, trip: { ownerId: string }): boolean {
  return !!actor && actor.userId === trip.ownerId;
}

export type BookingAccess = "traveller" | "provider" | "admin" | "support";

/**
 * Determines how an actor may see a booking. Providers only see bookings that contain their items
 * (and the service layer limits them to their own items); support staff get a minimal projection.
 */
export function bookingAccess(
  actor: Actor | null,
  booking: { travellerId: string; providerIds: string[] },
): BookingAccess | null {
  if (!actor) return null;
  if (actor.userId === booking.travellerId) return "traveller";
  if (isProvider(actor) && booking.providerIds.includes(actor.providerId!)) return "provider";
  if (isAdmin(actor)) return "admin";
  if (hasRole(actor, "support")) return "support";
  return null;
}

export function canManageProviderResource(actor: Actor | null, resource: { providerId: string }): boolean {
  return isProvider(actor) && actor!.providerId === resource.providerId;
}
