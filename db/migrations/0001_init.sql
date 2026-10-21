-- 0001_init: core schema for the marketplace.
-- Conventions:
--   * All timestamps are timestamptz (UTC). Destination/provider time zones are stored as IANA names.
--   * Money is stored as bigint minor units with an explicit ISO-4217 currency column.
--   * Status columns are constrained with CHECKs; transitions are enforced in the domain layer
--     and recorded in append-only event tables.

create extension if not exists btree_gist;

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end $$;

-- ───────────────────────────── Identity ─────────────────────────────

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) between 3 and 320),
  password_hash text not null,
  display_name text not null check (length(display_name) between 1 and 120),
  phone text,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  status_reason text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));
create trigger users_updated_at before update on users for each row execute function set_updated_at();

create table user_roles (
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in ('traveller', 'guide', 'operator', 'admin', 'support')),
  granted_by uuid references users (id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip text,
  user_agent text
);
create index sessions_user_idx on sessions (user_id);

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table auth_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_key_idx on auth_attempts (key, created_at desc);

create table traveller_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  home_country text,
  languages text[] not null default '{}',
  dietary_requirements text,
  accessibility_requirements text,
  notify_email boolean not null default true,
  marketing_consent boolean not null default false,
  analytics_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger traveller_profiles_updated_at before update on traveller_profiles for each row execute function set_updated_at();

-- ───────────────────────────── Catalogue ─────────────────────────────

create table destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  region text not null,
  county text,
  summary text not null,
  description text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  timezone text not null default 'Africa/Nairobi',
  travel_styles text[] not null default '{}',
  best_time_to_visit text,
  travel_info text,
  art_variant text not null default 'savanna'
    check (art_variant in ('savanna', 'coast', 'mountain', 'lake', 'city', 'desert', 'forest')),
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger destinations_updated_at before update on destinations for each row execute function set_updated_at();

create table destination_media (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations (id) on delete cascade,
  url text not null,
  alt_text text not null,
  credit text not null,
  license text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table experience_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order int not null default 0
);

create table provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users (id) on delete cascade,
  kind text not null check (kind in ('guide', 'operator')),
  display_name text not null check (length(display_name) between 2 and 120),
  slug text not null unique,
  headline text,
  bio text,
  photo_url text,
  intro_video_url text,
  languages text[] not null default '{}',
  specialties text[] not null default '{}',
  years_experience int check (years_experience between 0 and 70),
  base_destination_id uuid references destinations (id),
  timezone text not null default 'Africa/Nairobi',
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'info_requested', 'approved', 'rejected', 'suspended')),
  status_reason text,
  is_demo boolean not null default false,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index provider_profiles_status_idx on provider_profiles (kind, status);
create trigger provider_profiles_updated_at before update on provider_profiles for each row execute function set_updated_at();

create table provider_regions (
  provider_id uuid not null references provider_profiles (id) on delete cascade,
  destination_id uuid not null references destinations (id) on delete cascade,
  primary key (provider_id, destination_id)
);
create index provider_regions_destination_idx on provider_regions (destination_id);

create table provider_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles (id) on delete cascade,
  doc_type text not null check (doc_type in (
    'national_id', 'passport', 'tra_license', 'guide_certification', 'business_registration', 'insurance', 'other')),
  storage_key text not null unique,
  original_filename text not null,
  content_type text not null,
  size_bytes int not null check (size_bytes > 0),
  sha256 text not null,
  uploaded_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table provider_verifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles (id) on delete cascade,
  verification_type text not null check (verification_type in (
    'identity', 'tourism_license', 'guide_certification', 'business_registration', 'insurance')),
  status text not null check (status in ('passed', 'failed', 'revoked')),
  document_id uuid references provider_documents (id),
  reference_number text,
  reviewer_id uuid not null references users (id),
  decision_notes text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index provider_verifications_provider_idx on provider_verifications (provider_id, verification_type, created_at desc);

create table experiences (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles (id),
  destination_id uuid not null references destinations (id),
  category_id uuid not null references experience_categories (id),
  slug text not null unique,
  title text not null check (length(title) between 3 and 140),
  summary text not null,
  description text not null,
  duration_minutes int not null check (duration_minutes between 15 and 24 * 60),
  pricing_model text not null check (pricing_model in ('per_person', 'per_group')),
  currency char(3) not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  base_price_minor bigint not null check (base_price_minor >= 0),
  child_price_minor bigint check (child_price_minor >= 0),
  max_group_size int not null check (max_group_size between 1 and 500),
  min_age int check (min_age between 0 and 99),
  inclusions text[] not null default '{}',
  exclusions text[] not null default '{}',
  meeting_point text not null,
  meeting_lat double precision,
  meeting_lng double precision,
  preparation_notes text,
  accessibility_notes text,
  restrictions text,
  cancellation_policy text not null default 'moderate' check (cancellation_policy in ('flexible', 'moderate', 'strict')),
  min_notice_hours int not null default 24 check (min_notice_hours between 0 and 24 * 30),
  travel_styles text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'rejected', 'suspended', 'archived')),
  moderation_notes text,
  is_demo boolean not null default false,
  search tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index experiences_destination_idx on experiences (destination_id, status);
create index experiences_provider_idx on experiences (provider_id);
create index experiences_search_idx on experiences using gin (search);
create trigger experiences_updated_at before update on experiences for each row execute function set_updated_at();

create table experience_media (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences (id) on delete cascade,
  url text not null,
  alt_text text not null,
  credit text not null,
  license text not null,
  sort_order int not null default 0
);

create table experience_slots (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity > 0),
  reserved int not null default 0,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (reserved >= 0 and reserved <= capacity),
  unique (experience_id, starts_at)
);
create index experience_slots_time_idx on experience_slots (experience_id, starts_at);

create table guide_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles (id),
  title text not null check (length(title) between 3 and 140),
  description text not null,
  duration_minutes int not null check (duration_minutes between 60 and 16 * 60),
  pricing_model text not null check (pricing_model in ('per_person', 'per_group')),
  currency char(3) not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  base_price_minor bigint not null check (base_price_minor >= 0),
  max_group_size int not null check (max_group_size between 1 and 60),
  buffer_minutes int not null default 60 check (buffer_minutes between 0 and 600),
  min_notice_hours int not null default 48 check (min_notice_hours between 0 and 24 * 30),
  cancellation_policy text not null default 'moderate' check (cancellation_policy in ('flexible', 'moderate', 'strict')),
  status text not null default 'draft' check (status in ('draft', 'published', 'suspended', 'archived')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guide_services_provider_idx on guide_services (provider_id, status);
create trigger guide_services_updated_at before update on guide_services for each row execute function set_updated_at();

-- Weekly working hours in the provider's local time zone. weekday: 0 = Sunday.
create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index availability_rules_provider_idx on availability_rules (provider_id, weekday);

-- Date-specific overrides. 'unavailable' with null times blocks the whole day.
create table availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('unavailable', 'available')),
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  check ((start_time is null and end_time is null and kind = 'unavailable') or (start_time is not null and end_time > start_time))
);
create index availability_exceptions_provider_idx on availability_exceptions (provider_id, date);

-- Authorized discounts. Exactly one of experience_id / guide_service_id is set.
create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid references experiences (id) on delete cascade,
  guide_service_id uuid references guide_services (id) on delete cascade,
  kind text not null check (kind in ('group_discount')),
  min_travellers int not null check (min_travellers >= 2),
  percent_off_bps int not null check (percent_off_bps between 1 and 5000),
  active boolean not null default true,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  check ((experience_id is null) <> (guide_service_id is null))
);

create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users (id),
  updated_at timestamptz not null default now()
);

create table commission_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references provider_profiles (id),
  provider_kind text check (provider_kind in ('guide', 'operator')),
  category_id uuid references experience_categories (id),
  commission_bps int not null check (commission_bps between 0 and 5000),
  active boolean not null default true,
  note text,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);

create table favourites (
  user_id uuid not null references users (id) on delete cascade,
  target_type text not null check (target_type in ('experience', 'guide', 'destination')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

-- ───────────────────────────── Itineraries ─────────────────────────────

create table trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id),
  title text not null check (length(title) between 1 and 140),
  status text not null default 'draft' check (status in (
    'draft', 'quoted', 'pending_booking', 'confirmed', 'in_progress', 'completed', 'cancelled', 'archived')),
  start_date date not null,
  end_date date not null,
  adults int not null default 2 check (adults between 1 and 60),
  children int not null default 0 check (children between 0 and 60),
  budget_minor bigint check (budget_minor >= 0),
  currency char(3) not null default 'KES',
  interests text[] not null default '{}',
  pace text not null default 'balanced' check (pace in ('relaxed', 'balanced', 'adventurous')),
  tour_type text not null default 'private' check (tour_type in ('private', 'shared')),
  languages text[] not null default '{}',
  accessibility_notes text,
  dietary_notes text,
  accommodation_notes text,
  transport_notes text,
  primary_destination_id uuid references destinations (id),
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 60)
);
create index trips_owner_idx on trips (owner_id, status);
create trigger trips_updated_at before update on trips for each row execute function set_updated_at();

create table trip_members (
  trip_id uuid not null references trips (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  day_number int not null check (day_number >= 1),
  date date not null,
  destination_id uuid references destinations (id),
  notes text,
  unique (trip_id, day_number),
  unique (trip_id, date)
);

create table itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  day_id uuid not null references itinerary_days (id) on delete cascade,
  position int not null default 0,
  kind text not null check (kind in ('experience', 'guide', 'note')),
  experience_id uuid references experiences (id),
  slot_id uuid references experience_slots (id),
  guide_service_id uuid references guide_services (id),
  starts_at timestamptz,
  ends_at timestamptz,
  title text,
  notes text,
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'experience' or (experience_id is not null and slot_id is not null)),
  check (kind <> 'guide' or (guide_service_id is not null and starts_at is not null and ends_at is not null)),
  check (kind <> 'note' or title is not null),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index itinerary_items_day_idx on itinerary_items (day_id, position);
create index itinerary_items_trip_idx on itinerary_items (trip_id);
create trigger itinerary_items_updated_at before update on itinerary_items for each row execute function set_updated_at();

-- Immutable snapshots of an itinerary at quote / booking / confirmation time.
create table itinerary_versions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  version int not null,
  kind text not null check (kind in ('quote', 'booking', 'confirmed')),
  snapshot jsonb not null,
  pricing jsonb not null,
  total_minor bigint not null,
  currency char(3) not null,
  valid_until timestamptz,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  unique (trip_id, version)
);
create trigger itinerary_versions_append_only before update or delete on itinerary_versions
  for each row execute function forbid_mutation();

-- ───────────────────────────── Bookings & payments ─────────────────────────────

create table bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  trip_id uuid not null references trips (id),
  traveller_id uuid not null references users (id),
  version_id uuid not null references itinerary_versions (id),
  status text not null check (status in (
    'pending_provider', 'provider_declined', 'awaiting_payment', 'payment_pending', 'confirmed', 'in_progress',
    'completed', 'cancellation_requested', 'cancelled', 'expired')),
  payment_status text not null default 'unpaid' check (payment_status in (
    'unpaid', 'pending', 'paid', 'failed', 'refund_pending', 'partially_refunded', 'refunded')),
  currency char(3) not null,
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  service_fee_minor bigint not null default 0 check (service_fee_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  idempotency_key text not null unique,
  hold_expires_at timestamptz,
  cancellation_reason text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_traveller_idx on bookings (traveller_id, created_at desc);
create index bookings_status_idx on bookings (status, hold_expires_at);
create index bookings_trip_idx on bookings (trip_id);
create trigger bookings_updated_at before update on bookings for each row execute function set_updated_at();

create table booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  itinerary_item_id uuid references itinerary_items (id) on delete set null,
  provider_id uuid not null references provider_profiles (id),
  kind text not null check (kind in ('experience', 'guide')),
  experience_id uuid references experiences (id),
  slot_id uuid references experience_slots (id),
  guide_service_id uuid references guide_services (id),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  adults int not null,
  children int not null,
  pricing_model text not null,
  unit_price_minor bigint not null,
  gross_minor bigint not null,
  discount_minor bigint not null default 0,
  line_total_minor bigint not null check (line_total_minor >= 0),
  cancellation_policy text not null,
  terms_snapshot jsonb not null,
  commission_bps int not null,
  commission_rule_id uuid references commission_rules (id),
  commission_minor bigint not null,
  provider_earnings_minor bigint not null,
  provider_status text not null default 'pending' check (provider_status in ('pending', 'accepted', 'declined', 'cancelled')),
  provider_note text,
  provider_responded_at timestamptz,
  status text not null default 'active' check (status in ('active', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  check (commission_minor + provider_earnings_minor = line_total_minor)
);
create index booking_items_booking_idx on booking_items (booking_id);
create index booking_items_provider_idx on booking_items (provider_id, provider_status);

create table booking_status_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references bookings (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references users (id),
  actor_role text not null,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index booking_status_events_booking_idx on booking_status_events (booking_id, id);
create trigger booking_status_events_append_only before update or delete on booking_status_events
  for each row execute function forbid_mutation();

create table inventory_holds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  booking_item_id uuid not null references booking_items (id) on delete cascade,
  kind text not null check (kind in ('slot', 'guide')),
  slot_id uuid references experience_slots (id),
  quantity int,
  guide_provider_id uuid references provider_profiles (id),
  during tstzrange,
  status text not null check (status in ('held', 'confirmed', 'released', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'slot' or (slot_id is not null and quantity > 0)),
  check (kind <> 'guide' or (guide_provider_id is not null and during is not null)),
  -- A guide can never hold two overlapping active reservations (buffer included in `during`).
  exclude using gist (guide_provider_id with =, during with &&) where (kind = 'guide' and status in ('held', 'confirmed'))
);
create index inventory_holds_booking_idx on inventory_holds (booking_id);
create index inventory_holds_slot_idx on inventory_holds (slot_id) where kind = 'slot';
create trigger inventory_holds_updated_at before update on inventory_holds for each row execute function set_updated_at();

create table payment_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id),
  provider text not null check (provider in ('sandbox', 'mpesa', 'card')),
  idempotency_key text not null unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'succeeded', 'failed', 'cancelled')),
  provider_reference text,
  provider_receipt text,
  payer_hint text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);
create index payment_attempts_booking_idx on payment_attempts (booking_id);
create trigger payment_attempts_updated_at before update on payment_attempts for each row execute function set_updated_at();

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payment_attempt_id uuid references payment_attempts (id),
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null,
  processing_result text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id),
  payment_attempt_id uuid not null references payment_attempts (id),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  reason text not null,
  breakdown jsonb not null default '{}',
  status text not null default 'requested' check (status in (
    'requested', 'processing', 'succeeded', 'failed', 'rejected', 'manual_required')),
  provider_reference text,
  idempotency_key text not null unique,
  requested_by uuid not null references users (id),
  decided_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_booking_idx on refunds (booking_id);
create trigger refunds_updated_at before update on refunds for each row execute function set_updated_at();

create table payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles (id),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  method text not null,
  external_reference text,
  notes text,
  created_by uuid not null references users (id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payouts_updated_at before update on payouts for each row execute function set_updated_at();

-- Double-entry ledger. Each txn_id balances to zero. Positive = debit, negative = credit.
create table ledger_entries (
  id bigint generated always as identity primary key,
  txn_id uuid not null,
  entry_type text not null check (entry_type in (
    'payment_captured', 'refund_issued', 'payout_sent', 'unallocated_payment', 'adjustment')),
  account text not null check (account in (
    'cash', 'provider_payable', 'platform_revenue', 'tax_payable', 'processing_fees', 'suspense')),
  provider_id uuid references provider_profiles (id),
  booking_id uuid references bookings (id),
  booking_item_id uuid references booking_items (id),
  payment_attempt_id uuid references payment_attempts (id),
  refund_id uuid references refunds (id),
  payout_id uuid references payouts (id),
  amount_minor bigint not null check (amount_minor <> 0),
  currency char(3) not null,
  memo text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  check (account <> 'provider_payable' or provider_id is not null)
);
create index ledger_entries_txn_idx on ledger_entries (txn_id);
create index ledger_entries_provider_idx on ledger_entries (provider_id, account);
create index ledger_entries_booking_idx on ledger_entries (booking_id);
create trigger ledger_entries_append_only before update or delete on ledger_entries
  for each row execute function forbid_mutation();

-- Development-only payment provider state (backs the sandbox payment adapter).
create table sandbox_transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  amount_minor bigint not null,
  currency char(3) not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  refunded_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── Itinerary changes ─────────────────────────────

create table itinerary_change_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  booking_id uuid references bookings (id),
  requested_by uuid not null references users (id),
  message text not null check (length(message) between 5 and 4000),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'withdrawn')),
  response text,
  responded_by uuid references users (id),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── Communication & support ─────────────────────────────

create table conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings (id),
  subject text not null,
  created_at timestamptz not null default now()
);
create unique index conversations_booking_key on conversations (booking_id) where booking_id is not null;

create table conversation_participants (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in ('traveller', 'provider', 'support')),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on conversation_participants (user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references users (id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link text,
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  provider_message_id text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);
create index notification_deliveries_pending_idx on notification_deliveries (status, next_attempt_at);

-- Outbound email log. Bodies of sensitive messages (password resets) are only stored by the
-- development mail adapter so the local mailbox works; production adapters store metadata only.
create table email_messages (
  id uuid primary key default gen_random_uuid(),
  to_address text not null,
  subject text not null,
  text_body text,
  provider text not null,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_item_id uuid not null unique references booking_items (id),
  booking_id uuid not null references bookings (id),
  reviewer_id uuid not null references users (id),
  provider_id uuid not null references provider_profiles (id),
  experience_id uuid references experiences (id),
  rating smallint not null check (rating between 1 and 5),
  title text check (length(title) <= 140),
  body text not null check (length(body) between 10 and 4000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  moderation_reason text,
  provider_response text check (length(provider_response) <= 2000),
  provider_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_provider_idx on reviews (provider_id, status);
create index reviews_experience_idx on reviews (experience_id, status);
create trigger reviews_updated_at before update on reviews for each row execute function set_updated_at();

create table support_cases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  kind text not null check (kind in ('support', 'dispute', 'safety', 'report')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'escalated', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  subject text not null check (length(subject) between 3 and 200),
  description text not null check (length(description) between 10 and 8000),
  opened_by uuid references users (id),
  contact_email text,
  booking_id uuid references bookings (id),
  review_id uuid references reviews (id),
  assigned_to uuid references users (id),
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_cases_status_idx on support_cases (status, priority);
create trigger support_cases_updated_at before update on support_cases for each row execute function set_updated_at();

create table support_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references support_cases (id) on delete cascade,
  actor_id uuid references users (id),
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references users (id),
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on audit_logs (created_at desc);
create trigger audit_logs_append_only before update or delete on audit_logs
  for each row execute function forbid_mutation();

create table analytics_events (
  id bigint generated always as identity primary key,
  name text not null,
  user_id uuid references users (id) on delete set null,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index analytics_events_name_idx on analytics_events (name, created_at);

-- ───────────────────────────── Row Level Security ─────────────────────────────
-- The application connects with a privileged server-side role and authorizes every request in
-- the domain layer. RLS is enabled with no policies so that if this schema is exposed through
-- Supabase's Data API (anon / authenticated roles), every table is deny-by-default.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
