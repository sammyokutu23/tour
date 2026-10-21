-- 0002_travel_together: "Travel with People Like You" — travel groups, membership, invitations,
-- shared itinerary proposals and voting, group chat, blocking, reports and moderation.
-- Reuses users, destinations, trips/itinerary, conversations/messages, notifications and audit_logs.

-- ───────────────────────────── Reference data ─────────────────────────────

create table travel_interests (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  sort_order int not null default 0
);

insert into travel_interests (slug, name, sort_order) values
  ('wildlife', 'Wildlife & safari', 1),
  ('adventure', 'Hiking & adventure', 2),
  ('beach', 'Beach & relaxation', 3),
  ('food', 'Food & local cuisine', 4),
  ('culture', 'Culture & history', 5),
  ('photography', 'Photography', 6),
  ('nightlife', 'Nightlife', 7),
  ('nature', 'Nature & conservation', 8),
  ('road-trips', 'Road trips', 9),
  ('luxury', 'Luxury travel', 10),
  ('budget', 'Budget travel', 11),
  ('family', 'Family-friendly', 12);

-- ───────────────────────────── Social travel profile ─────────────────────────────

create table travel_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  bio text check (length(bio) <= 600),
  photo_url text check (photo_url is null or photo_url like 'https://%'),
  pace text check (pace in ('relaxed', 'balanced', 'adventurous')),
  destination_slugs text[] not null default '{}',
  past_trips text check (length(past_trips) <= 1000),
  visibility text not null default 'members' check (visibility in ('public', 'members', 'private')),
  -- Self-attested; social matching is restricted to adults (see docs/travel-together.md).
  adult_confirmed_at timestamptz,
  guidelines_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger travel_profiles_updated_at before update on travel_profiles for each row execute function set_updated_at();

create table user_travel_interests (
  user_id uuid not null references users (id) on delete cascade,
  interest_slug text not null references travel_interests (slug),
  primary key (user_id, interest_slug)
);

-- Generic user blocking (used by Travel Together and direct enquiries).
create table user_blocks (
  blocker_id uuid not null references users (id) on delete cascade,
  blocked_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on user_blocks (blocked_id);

-- ───────────────────────────── Groups ─────────────────────────────

create table travel_groups (
  id uuid primary key default gen_random_uuid(),
  organizer_user_id uuid not null references users (id),
  name text not null check (length(name) between 3 and 80),
  slug text not null unique,
  description text not null check (length(description) between 20 and 2000),
  destination_id uuid not null references destinations (id),
  start_date date not null,
  end_date date not null,
  max_members int not null check (max_members between 2 and 30),
  language text not null default 'English' check (length(language) between 2 and 40),
  -- public: anyone eligible joins directly · approval: listed, organizer approves · private: invite only, never listed
  visibility text not null check (visibility in ('public', 'approval', 'private')),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed', 'suspended')),
  currency char(3) not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  min_budget_minor bigint check (min_budget_minor >= 0),
  max_budget_minor bigint check (max_budget_minor >= 0),
  budget_includes text[] not null default '{}',
  expense_style text not null default 'individual' check (expense_style in ('individual', 'shared', 'mixed')),
  travel_pace text not null default 'balanced' check (travel_pace in ('relaxed', 'balanced', 'adventurous')),
  activity_level text not null default 'moderate' check (activity_level in ('easy', 'moderate', 'challenging')),
  shared_transport text not null default 'optional' check (shared_transport in ('none', 'optional', 'planned')),
  accommodation text not null default 'own' check (accommodation in ('own', 'optional_shared')),
  arrival_notes text check (length(arrival_notes) <= 500),
  communication_notes text check (length(communication_notes) <= 500),
  cancellation_notes text check (length(cancellation_notes) <= 500),
  booking_deadline date,
  approval_policy text not null default 'majority' check (approval_policy in ('organizer', 'majority')),
  cover_art text not null default 'savanna' check (cover_art in ('savanna', 'coast', 'mountain', 'lake', 'city', 'desert', 'forest')),
  cover_storage_key text,
  trip_id uuid unique references trips (id),
  is_demo boolean not null default false,
  status_reason text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 30),
  check (min_budget_minor is null or max_budget_minor is null or max_budget_minor >= min_budget_minor),
  check (booking_deadline is null or booking_deadline <= end_date),
  check (budget_includes <@ array['accommodation', 'transport', 'activities', 'meals']::text[])
);
create index travel_groups_discovery_idx on travel_groups (status, visibility, start_date);
create index travel_groups_destination_idx on travel_groups (destination_id);
create index travel_groups_organizer_idx on travel_groups (organizer_user_id);
create trigger travel_groups_updated_at before update on travel_groups for each row execute function set_updated_at();

create table travel_group_interests (
  group_id uuid not null references travel_groups (id) on delete cascade,
  interest_slug text not null references travel_interests (slug),
  primary key (group_id, interest_slug)
);
create index travel_group_interests_slug_idx on travel_group_interests (interest_slug);

-- One membership row per (group, user); its status changes over time (left, removed, banned …).
create table travel_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references travel_groups (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null default 'member' check (role in ('organizer', 'co_organizer', 'member')),
  status text not null check (status in ('active', 'left', 'removed', 'banned')),
  status_reason text,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index travel_group_members_user_idx on travel_group_members (user_id, status);
create index travel_group_members_group_idx on travel_group_members (group_id, status);
create trigger travel_group_members_updated_at before update on travel_group_members for each row execute function set_updated_at();

-- Defence in depth: membership may never exceed capacity, whatever code path writes it.
create function enforce_group_capacity() returns trigger language plpgsql as $$
declare cap int; active_count int;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select max_members into cap from travel_groups where id = new.group_id for update;
    select count(*) into active_count from travel_group_members where group_id = new.group_id and status = 'active' and id <> new.id;
    if active_count + 1 > cap then
      raise exception 'travel group % is full', new.group_id using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger travel_group_members_capacity before insert or update on travel_group_members
  for each row execute function enforce_group_capacity();

create table travel_group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references travel_groups (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  message text check (length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn', 'expired')),
  reviewed_by uuid references users (id),
  reviewed_at timestamptz,
  decision_note text check (length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index travel_group_join_requests_pending_key on travel_group_join_requests (group_id, user_id) where status = 'pending';
create trigger travel_group_join_requests_updated_at before update on travel_group_join_requests for each row execute function set_updated_at();

-- Direct invitations target a user; link invitations carry a hashed token with expiry and a use limit.
create table travel_group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references travel_groups (id) on delete cascade,
  invited_user_id uuid references users (id) on delete cascade,
  invited_by uuid not null references users (id),
  token_hash text unique,
  max_uses int not null default 1 check (max_uses between 1 and 30),
  use_count int not null default 0 check (use_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((invited_user_id is null) <> (token_hash is null)),
  check (use_count <= max_uses)
);
create unique index travel_group_invitations_user_pending_key on travel_group_invitations (group_id, invited_user_id) where status = 'pending' and invited_user_id is not null;

-- ───────────────────────────── Shared itinerary ─────────────────────────────

-- Trips gain an optional group link. 'plan' = the group's shared plan (never booked directly);
-- 'personal' = a member's own booking trip; 'group_booking' = an organizer booking for the whole group.
alter table trips add column group_id uuid references travel_groups (id);
alter table trips add column group_purpose text check (group_purpose in ('plan', 'personal', 'group_booking'));
alter table trips add constraint trips_group_link_check check ((group_id is null) = (group_purpose is null));
create unique index trips_group_purpose_key on trips (group_id, owner_id, group_purpose) where group_id is not null;

create table travel_group_proposals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references travel_groups (id) on delete cascade,
  proposed_by uuid not null references users (id),
  kind text not null check (kind in ('experience', 'guide', 'note')),
  experience_id uuid references experiences (id),
  slot_id uuid references experience_slots (id),
  guide_service_id uuid references guide_services (id),
  day_date date not null,
  start_time time,
  title text not null check (length(title) between 2 and 140),
  notes text check (length(notes) <= 1000),
  is_optional boolean not null default false,
  status text not null check (status in ('proposed', 'voting', 'approved', 'rejected', 'cancelled')),
  voting_deadline timestamptz,
  decided_by uuid references users (id),
  decided_at timestamptz,
  itinerary_item_id uuid references itinerary_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'experience' or slot_id is not null),
  check (kind <> 'guide' or (guide_service_id is not null and start_time is not null))
);
create index travel_group_proposals_group_idx on travel_group_proposals (group_id, status);
create trigger travel_group_proposals_updated_at before update on travel_group_proposals for each row execute function set_updated_at();

create table travel_group_activity_votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references travel_group_proposals (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  vote text not null check (vote in ('yes', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id, user_id)
);
create trigger travel_group_activity_votes_updated_at before update on travel_group_activity_votes for each row execute function set_updated_at();

create table travel_group_proposal_comments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references travel_group_proposals (id) on delete cascade,
  user_id uuid not null references users (id),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index travel_group_proposal_comments_idx on travel_group_proposal_comments (proposal_id, created_at);

-- Append-only history of membership, itinerary, settings and moderation changes.
create table travel_group_events (
  id bigint generated always as identity primary key,
  group_id uuid not null references travel_groups (id) on delete cascade,
  actor_id uuid references users (id),
  category text not null check (category in ('membership', 'itinerary', 'settings', 'moderation')),
  action text not null,
  subject_user_id uuid references users (id),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index travel_group_events_group_idx on travel_group_events (group_id, id);
create trigger travel_group_events_append_only before update or delete on travel_group_events
  for each row execute function forbid_mutation();

-- ───────────────────────────── Chat & safety ─────────────────────────────

alter table conversations add column group_id uuid references travel_groups (id) on delete cascade;
create unique index conversations_group_key on conversations (group_id) where group_id is not null;
alter table conversation_participants drop constraint conversation_participants_role_check;
alter table conversation_participants add constraint conversation_participants_role_check
  check (role in ('traveller', 'provider', 'support', 'group_member', 'group_organizer'));
alter table messages add column kind text not null default 'text' check (kind in ('text', 'announcement', 'system'));
alter table messages add column hidden_at timestamptz;
alter table messages add column hidden_by uuid references users (id);

create table travel_group_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users (id),
  group_id uuid references travel_groups (id) on delete set null,
  reported_user_id uuid references users (id),
  message_id uuid references messages (id) on delete set null,
  category text not null check (category in ('harassment', 'scam', 'impersonation', 'safety', 'spam', 'inappropriate', 'other')),
  details text not null check (length(details) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  outcome text check (length(outcome) <= 2000),
  admin_notes text check (length(admin_notes) <= 4000),
  resolved_by uuid references users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (group_id is not null or reported_user_id is not null or message_id is not null)
);
create index travel_group_reports_status_idx on travel_group_reports (status, priority, created_at);
create trigger travel_group_reports_updated_at before update on travel_group_reports for each row execute function set_updated_at();

-- Deny-by-default for any Data API exposure, as for every other table.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
