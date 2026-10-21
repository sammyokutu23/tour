# Travel Together

“Travel with people like you”: travellers form small groups around a shared trip, plan it together and each book through the normal booking engine.

Routes live under `/travel-together` (discovery, create, `[groupId]` with members/itinerary/chat/edit, my-groups, requests, messages, profile, guidelines, `invite/[token]`). Admin tools are under `/admin/travel-together`.

Code: schema `db/migrations/0002_travel_together.sql`, pure rules `src/domain/travel-groups.ts`, services `src/server/services/travel-groups.ts`, actions `src/app/actions/travel.ts`, UI `src/components/travel/`.

## Eligibility

- A traveller must have a **travel profile** with two self-attestations: "I am 18 or older" (`adult_confirmed_at`) and acceptance of the community guidelines (`guidelines_accepted_at`). Without both, they can browse but cannot create, join, message or propose.
- The age check is **self-attested only**. There is no identity or background check, and the UI never claims one. **Legal review needed** before launch on whether self-attestation is enough.
- We never collect or match on passport details, home address, live location, religion, ethnicity, health, sexuality or other sensitive attributes.

## Profile visibility

`travel_profiles.visibility`:

| Value | Who sees name, photo, bio, interests |
|---|---|
| `public` | Anyone viewing a group the person belongs to |
| `members` | Only fellow active members of a shared group |
| `private` | Nobody else (shown as an anonymous member) |

Blocks (`user_blocks`) are two-way. Blocked people's groups are hidden from discovery, their messages are hidden in chat, and they cannot join each other's groups or start enquiries with each other.

## Matching (explainable)

`matchGroup()` scores a group 0–100 against the viewer's profile and search filters. Every point comes with a plain-language reason shown on the card (for example "Dates overlap by 3 days").

| Signal | Weight |
|---|---|
| Date overlap | 30 |
| Destination | 25 |
| Shared interests | 20 |
| Budget fit | 15 |
| Pace | 5 |
| Language | 5 |

Matching only re-orders results. It never hides a group, and no hidden or sensitive signal is used.

## Group visibility and joining

| Visibility | Discovery | How to join |
|---|---|---|
| `public` | Listed | Join instantly while places remain |
| `approval` | Listed | Send a request; the organizer (or co-organizer) approves or declines |
| `private` | Never listed; outsiders get 404 | Email invitation or single-use / limited-use invite link |

- Invite links store only a hash of the token. The raw link is shown once, when it is created. Links have an expiry and a maximum number of uses.
- Inviting by email never reveals whether an address has an account.
- **Capacity** is enforced twice: by a `FOR UPDATE` lock on the group row, and by the `enforce_group_capacity` trigger (it raises `23514` when the group is full). The integration test races 6 joiners for 2 places, and exactly 2 succeed.

### Membership status mapping

The brief's statuses map to storage like this:

| Brief status | Where it lives |
|---|---|
| invited | `travel_group_invitations.status = 'pending'` |
| requested | `travel_group_join_requests.status = 'pending'` |
| active / left / removed / banned | `travel_group_members.status` |
| declined / withdrawn / expired | the request or invitation row |

Organizers cannot leave a group without first transferring ownership. Removal can also ban the person, which stops them rejoining. Removals are audited.

## Shared itinerary and voting

Each group owns a **plan trip** (`trips.group_purpose = 'plan'`). Journey Studio refuses to edit or quote it directly, and it doesn't appear in personal trip lists.

1. A member proposes an experience slot, a guide day or a note. The proposer's own "yes" vote counts.
2. Members vote yes or no (one vote per person; votes can be changed).
3. The proposal settles according to the group's `approval_policy`:
   - `majority`: approved when yes × 2 > active members; rejected when no × 2 ≥ active members.
   - `organizer`: the organizer decides.

   When a proposal is approved, its item is copied into the plan trip.
4. **Voting never books or charges anyone.**

Displayed proposal states "awaiting provider" and "confirmed" are not stored; they come from the real bookings linked to the item.

### Booking an agreed item

- **Per-person prices:** each member presses *Book my place*. This creates a personal trip (`group_purpose = 'personal'`, 1 adult) and opens it in Studio. The normal quote → request → provider acceptance → payment flow follows, including price revalidation.
- **Per-group prices and guides:** only the organizer can book, as a `group_booking` trip sized to the active member count. The itinerary shows each member's estimated share, for information only.

### No shared wallet

There is deliberately no peer-to-peer money movement, pooled wallet or reimbursement feature. Each person pays the platform directly for their own booking.

**Possible later design for cost splitting:** the organizer books the group item. The platform then issues each member a separate payment request for their share through the existing payment adapters, and confirms the booking only once all shares are paid or the organizer covers the remainder. That keeps money flowing through the regulated payment path and the ledger. It needs legal and payments review first.

## Group chat

Each group has a conversation (`conversations.group_id`). Its participants are kept in sync with active membership: people who leave or are removed lose access immediately. Organizers can post announcements and hide messages; hidden messages are recorded with `hidden_by`.

## Safety and moderation

- Anyone signed in can report a group, a member or a message. Reports get a priority (normal / high / urgent) from their category, so safety concerns rise to the top.
- Admins see a queue at `/admin/travel-together`. They can open a report (opening a reported message's contents is audited), record an outcome, and suspend or restore a group.
- Group lifecycle changes are written to `travel_group_events`, which is append-only (enforced by a trigger).

### Rate limits

| Action | Limit |
|---|---|
| Create a group | 5 per day |
| Send join requests | 20 per hour |
| Send invitations | 30 per day |
| Make proposals | 30 per hour |
| Post comments | 30 per 10 minutes |
| Send chat messages | 20 per minute |
| File reports | 10 per hour |

## Background housekeeping

`npm run jobs` calls `travelGroupHousekeeping`, which:

- marks published groups as completed after their end date;
- expires pending invitations that have passed their expiry;
- expires pending join requests once the trip has started or the group is no longer published.

## Retention and account deletion (policy to confirm)

Not yet automated. Proposed:

- Chat messages and proposals are kept for 12 months after a group completes, then deleted.
- Reports and moderation events are kept for 24 months.
- When an account is deleted, its travel profile, interests and blocks are removed. Its messages are shown as "Former member". Groups it organised are cancelled, or transferred to a co-organizer if there is one.
- Account deletion is still handled by support (see `launch-checklist.md`).

This needs confirming as part of the ODPC retention schedule.

## Demo data

The seed creates three demo groups (`is_demo = true`, labelled "Demo") and two demo travellers, "Amina (demo)" and "Kip (demo)", using `@demo.test` addresses. They are never seeded in production.

## Tests

- `tests/unit/travel-groups.test.ts`: 10 tests covering matching, overlap, voting outcomes and state machines.
- `tests/integration/travel-together.test.ts`: 20 tests on real Postgres (PGlite) covering the brief's scenarios:
  - visibility and privacy;
  - join, approve and invite;
  - concurrent capacity;
  - blocking;
  - voting without booking;
  - booking through the engine;
  - chat access after leaving;
  - reports;
  - admin suspension;
  - rate limits.
- `tests/e2e/travel-together.spec.ts`: 9 browser journeys:
  - browse;
  - create and publish;
  - request and approve;
  - propose, vote and see the item agreed;
  - book a place;
  - members-only chat;
  - report and admin resolution;
  - leave and lose access.
