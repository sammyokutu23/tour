"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getActor } from "@/server/auth/session";
import {
  acceptInviteLink,
  adminSetGroupStatus,
  adminUpdateReport,
  blockUser,
  cancelGroup,
  castVote,
  commentOnProposal,
  createInviteLink,
  createProposal,
  decideProposal,
  groupInputSchema,
  hideGroupMessage,
  inviteByEmail,
  joinOrRequest,
  leaveGroup,
  prepareBooking,
  removeMember,
  reportSchema,
  respondToInvitation,
  revokeInvitation,
  reviewRequest,
  saveGroup,
  saveTravelProfile,
  sendGroupMessage,
  setGroupCover,
  setMemberRole,
  submitReport,
  transferOwnership,
  travelProfileSchema,
  unblockUser,
  withdrawRequest,
} from "@/server/services/travel-groups";
import { setUserStatus } from "@/server/services/admin";
import { track } from "@/server/services/analytics";
import { getStorage, MAX_UPLOAD_BYTES, sha256, sniffDocumentType } from "@/server/storage";
import { requireAdmin } from "@/domain/authz";
import { UserError } from "@/server/errors";
import { bool, int, moneyMinor, optStr, runAction, str } from "./run";
import type { ActionState } from "./types";

async function actorOr(next: string) {
  const a = await getActor();
  if (!a) redirect(`/login?next=${encodeURIComponent(next)}`);
  return a;
}

// ── profile ──

export async function saveTravelProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr("/travel-together/profile");
  return runAction(async () => {
    await saveTravelProfile(
      await getDb(),
      a,
      travelProfileSchema.parse({
        bio: optStr(fd, "bio"),
        photoUrl: optStr(fd, "photoUrl"),
        pace: optStr(fd, "pace"),
        destinationSlugs: fd.getAll("destinations").map(String),
        pastTrips: optStr(fd, "pastTrips"),
        visibility: str(fd, "visibility") || "members",
        interests: fd.getAll("interests").map(String),
        adultConfirmed: bool(fd, "adult"),
        acceptGuidelines: bool(fd, "guidelines"),
      }),
    );
    refresh();
    const next = str(fd, "next");
    if (next.startsWith("/travel-together")) redirect(next);
    return { ok: "Travel profile saved." };
  });
}

export async function blockAction(userId: string, block: boolean): Promise<ActionState> {
  const a = await actorOr("/travel-together");
  return runAction(async () => {
    const db = await getDb();
    if (block) await blockUser(db, a, userId);
    else await unblockUser(db, a, userId);
    refresh();
    return { ok: block ? "Blocked. They can't contact you or join your groups." : "Unblocked." };
  });
}

// ── groups ──

function groupFrom(fd: FormData) {
  return groupInputSchema.parse({
    name: str(fd, "name"),
    description: str(fd, "description"),
    destinationId: str(fd, "destinationId"),
    startDate: str(fd, "startDate"),
    endDate: str(fd, "endDate"),
    maxMembers: int(fd, "maxMembers", 0),
    language: str(fd, "language") || "English",
    visibility: str(fd, "visibility"),
    interests: fd.getAll("interests").map(String),
    currency: "KES",
    minBudgetMinor: moneyMinor(fd, "minBudget"),
    maxBudgetMinor: moneyMinor(fd, "maxBudget"),
    budgetIncludes: fd.getAll("budgetIncludes").map(String),
    expenseStyle: str(fd, "expenseStyle") || "individual",
    travelPace: str(fd, "travelPace") || "balanced",
    activityLevel: str(fd, "activityLevel") || "moderate",
    sharedTransport: str(fd, "sharedTransport") || "optional",
    accommodation: str(fd, "accommodation") || "own",
    arrivalNotes: optStr(fd, "arrivalNotes"),
    communicationNotes: optStr(fd, "communicationNotes"),
    cancellationNotes: optStr(fd, "cancellationNotes"),
    bookingDeadline: optStr(fd, "bookingDeadline"),
    approvalPolicy: str(fd, "approvalPolicy") || "majority",
    coverArt: str(fd, "coverArt") || "savanna",
  });
}

async function storeCover(groupId: string, file: FormDataEntryValue | null, actor: Awaited<ReturnType<typeof actorOr>>) {
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > 5 * 1024 * 1024 || file.size > MAX_UPLOAD_BYTES) throw new UserError("Cover images must be 5 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffDocumentType(bytes);
  if (!sniffed || sniffed.type === "application/pdf") throw new UserError("Upload a JPEG, PNG or WebP image for the cover.");
  const key = `groups/${groupId}/cover-${sha256(bytes).slice(0, 16)}.${sniffed.ext}`;
  await getStorage().put(key, bytes, sniffed.type);
  await setGroupCover(await getDb(), actor, groupId, key);
}

export async function saveGroupAction(groupId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr("/travel-together/create");
  let id = groupId;
  const intent = str(fd, "intent") === "publish" ? "publish" : "draft";
  const result = await runAction(async () => {
    if (intent === "publish" && !bool(fd, "guidelines")) return { error: "Please agree to the community guidelines before publishing." };
    const db = await getDb();
    ({ id } = await saveGroup(db, a, groupId, groupFrom(fd), intent));
    await storeCover(id!, fd.get("cover"), a);
    if (!groupId) await track(db, "group_created", { published: intent === "publish" }, a.userId);
    if (groupId) {
      refresh();
      return { ok: intent === "publish" ? "Published." : "Saved." };
    }
  });
  if (result?.error || groupId) return result;
  redirect(`/travel-together/${id}?created=${intent}`);
}

export async function cancelGroupAction(groupId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}`);
  return runAction(async () => {
    const db = await getDb();
    await cancelGroup(db, a, groupId, str(fd, "reason"));
    await track(db, "group_cancelled", {}, a.userId);
    refresh();
    return { ok: "The group was cancelled and members were notified." };
  });
}

// ── membership ──

export async function joinAction(groupId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}`);
  return runAction(async () => {
    const db = await getDb();
    const res = await joinOrRequest(db, a, groupId, optStr(fd, "message"));
    await track(db, res === "joined" ? "group_joined" : "group_join_requested", {}, a.userId);
    refresh();
    return { ok: res === "joined" ? "You're in! Say hello in the group chat." : "Request sent. The organizer will review it." };
  });
}

export async function withdrawRequestAction(groupId: string): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}`);
  return runAction(async () => {
    await withdrawRequest(await getDb(), a, groupId);
    refresh();
  });
}

export async function reviewRequestAction(requestId: string, decision: "approve" | "decline", _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr("/travel-together/requests");
  return runAction(async () => {
    const db = await getDb();
    await reviewRequest(db, a, requestId, decision, optStr(fd, "note"));
    if (decision === "approve") await track(db, "group_join_approved", {}, a.userId);
    refresh();
    return { ok: decision === "approve" ? "Approved — they're now a member." : "Declined." };
  });
}

export async function respondInvitationAction(invitationId: string, decision: "accept" | "decline"): Promise<ActionState> {
  const a = await actorOr("/travel-together/requests");
  let groupId = "";
  const result = await runAction(async () => {
    ({ groupId } = await respondToInvitation(await getDb(), a, invitationId, decision));
    if (decision === "decline") {
      refresh();
      return { ok: "Invitation declined." };
    }
  });
  if (result?.error || decision === "decline") return result;
  redirect(`/travel-together/${groupId}`);
}

export async function inviteEmailAction(groupId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}/members`);
  return runAction(async () => {
    await inviteByEmail(await getDb(), a, groupId, str(fd, "email"));
    refresh();
    return { ok: "If that email belongs to a traveller who can join, they'll receive your invitation." };
  });
}

export async function inviteLinkAction(groupId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}/members`);
  return runAction(async () => {
    const token = await createInviteLink(await getDb(), a, groupId, { maxUses: int(fd, "maxUses", 1), days: int(fd, "days", 7) });
    refresh();
    return { ok: "Invitation link created. Copy it now — for security it won't be shown again.", data: { token } };
  });
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  const a = await actorOr("/travel-together/my-groups");
  return runAction(async () => {
    await revokeInvitation(await getDb(), a, invitationId);
    refresh();
  });
}

export async function acceptInviteLinkAction(token: string): Promise<ActionState> {
  const a = await actorOr(`/travel-together/invite/${token}`);
  let groupId = "";
  const result = await runAction(async () => {
    ({ groupId } = await acceptInviteLink(await getDb(), a, token));
  });
  if (result?.error) return result;
  redirect(`/travel-together/${groupId}`);
}

export async function leaveGroupAction(groupId: string): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}`);
  const result = await runAction(async () => {
    await leaveGroup(await getDb(), a, groupId);
  });
  if (result?.error) return result;
  redirect("/travel-together/my-groups?left=1");
}

export async function removeMemberAction(groupId: string, userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}/members`);
  return runAction(async () => {
    await removeMember(await getDb(), a, groupId, userId, { ban: bool(fd, "ban"), reason: str(fd, "reason") });
    refresh();
    return { ok: "Member removed." };
  });
}

export async function memberRoleAction(groupId: string, userId: string, role: "co_organizer" | "member"): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}/members`);
  return runAction(async () => {
    await setMemberRole(await getDb(), a, groupId, userId, role);
    refresh();
  });
}

export async function transferAction(groupId: string, userId: string): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}/members`);
  return runAction(async () => {
    await transferOwnership(await getDb(), a, groupId, userId);
    refresh();
    return { ok: "Ownership transferred. You're now a co-organizer." };
  });
}

// ── itinerary ──

export async function proposeAction(groupId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}/itinerary`);
  return runAction(async () => {
    const kind = str(fd, "kind");
    const common = { notes: optStr(fd, "notes"), isOptional: bool(fd, "optional") };
    const input =
      kind === "experience"
        ? { kind: "experience" as const, slotId: str(fd, "slotId"), ...common }
        : kind === "guide"
          ? { kind: "guide" as const, serviceId: str(fd, "serviceId"), date: str(fd, "date"), startTime: str(fd, "startTime") || "08:00", ...common }
          : { kind: "note" as const, title: str(fd, "title"), date: str(fd, "date"), ...common };
    const db = await getDb();
    await createProposal(db, a, groupId, input);
    await track(db, "group_proposal_created", { kind }, a.userId);
    refresh();
    return { ok: "Proposal shared with the group." };
  });
}

export async function voteAction(proposalId: string, vote: "yes" | "no"): Promise<ActionState> {
  const a = await actorOr("/travel-together/my-groups");
  return runAction(async () => {
    const db = await getDb();
    const outcome = await castVote(db, a, proposalId, vote);
    await track(db, "group_vote_cast", { vote }, a.userId);
    refresh();
    return { ok: outcome === "approved" ? "Vote counted — the group agreed!" : outcome === "rejected" ? "Vote counted — the group decided against it." : "Vote counted." };
  });
}

export async function decideProposalAction(proposalId: string, decision: "approve" | "reject" | "cancel"): Promise<ActionState> {
  const a = await actorOr("/travel-together/my-groups");
  return runAction(async () => {
    await decideProposal(await getDb(), a, proposalId, decision);
    refresh();
  });
}

export async function commentAction(proposalId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr("/travel-together/my-groups");
  return runAction(async () => {
    await commentOnProposal(await getDb(), a, proposalId, str(fd, "body"));
    refresh();
    return { ok: true };
  });
}

export async function bookAgreedAction(proposalId: string): Promise<ActionState> {
  const a = await actorOr("/travel-together/my-groups");
  let tripId = "";
  const result = await runAction(async () => {
    const db = await getDb();
    ({ tripId } = await prepareBooking(db, a, proposalId));
    await track(db, "group_booking_started", {}, a.userId);
  });
  if (result?.error) return result;
  redirect(`/studio/${tripId}`);
}

// ── chat ──

export async function groupMessageAction(groupId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr(`/travel-together/${groupId}/chat`);
  return runAction(async () => {
    await sendGroupMessage(await getDb(), a, groupId, str(fd, "body"), bool(fd, "announcement") ? "announcement" : "text");
    refresh();
    return { ok: true };
  });
}

export async function hideMessageAction(messageId: string): Promise<ActionState> {
  const a = await actorOr("/travel-together/messages");
  return runAction(async () => {
    await hideGroupMessage(await getDb(), a, messageId, "Removed by moderator");
    refresh();
  });
}

// ── reports ──

export async function reportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actorOr("/travel-together");
  return runAction(async () => {
    const db = await getDb();
    await submitReport(
      db,
      a,
      reportSchema.parse({
        groupId: optStr(fd, "groupId"),
        reportedUserId: optStr(fd, "reportedUserId"),
        messageId: optStr(fd, "messageId"),
        category: str(fd, "category"),
        details: str(fd, "details"),
      }),
    );
    await track(db, "group_report_submitted", { category: str(fd, "category") }, null);
    if (bool(fd, "block") && optStr(fd, "reportedUserId")) await blockUser(db, a, str(fd, "reportedUserId"));
    return { ok: "Thank you. Our safety team will review this privately. If you are in immediate danger, contact local emergency services (999 or 112 in Kenya)." };
  });
}

// ── admin ──

export async function adminReportAction(reportId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = requireAdmin(await getActor());
  return runAction(async () => {
    const db = await getDb();
    await adminUpdateReport(db, a, reportId, { status: str(fd, "status") as "resolved", outcome: optStr(fd, "outcome"), adminNotes: optStr(fd, "adminNotes") });
    if (bool(fd, "suspendGroup") && optStr(fd, "groupId")) await adminSetGroupStatus(db, a, str(fd, "groupId"), "suspended", str(fd, "outcome") || "Suspended after report review");
    if (bool(fd, "restrictUser") && optStr(fd, "reportedUserId")) await setUserStatus(db, a, str(fd, "reportedUserId"), "suspended", str(fd, "outcome") || "Restricted after report review");
    refresh();
    return { ok: "Report updated." };
  });
}

export async function adminGroupStatusAction(groupId: string, to: "suspended" | "published", _: ActionState, fd: FormData): Promise<ActionState> {
  const a = requireAdmin(await getActor());
  return runAction(async () => {
    await adminSetGroupStatus(await getDb(), a, groupId, to, str(fd, "reason"));
    refresh();
    return { ok: to === "suspended" ? "Group suspended." : "Group restored." };
  });
}

export async function adminHideMessageAction(messageId: string): Promise<ActionState> {
  const a = requireAdmin(await getActor());
  return runAction(async () => {
    await hideGroupMessage(await getDb(), a, messageId, "Removed after report review");
    refresh();
    return { ok: "Message removed." };
  });
}
