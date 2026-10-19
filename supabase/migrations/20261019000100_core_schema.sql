-- =============================================================================
-- Core schema: products, batches, serialized units, tokens, label jobs,
-- verification events, recalls, investigations, support, audit, rate limits.
--
-- Conventions
--   * Enumerations are `text` + CHECK constraints (cheap to evolve). The
--     TypeScript mirrors live in src/server/domain/enums.ts and a test asserts
--     they cannot drift from these constraints.
--   * Plaintext tokens are NEVER stored. Only SHA-256 hashes (bytea, 32 bytes).
--   * Units, tokens, events and audit rows are never deleted by the app; foreign
--     keys use ON DELETE RESTRICT where history matters.
-- =============================================================================

create schema if not exists app_private;
revoke all on schema app_private from public;

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sequences for human-readable references
-- -----------------------------------------------------------------------------
create sequence public.serial_seq as bigint start 1 increment 1 minvalue 1 no cycle;
create sequence public.investigation_ref_seq as bigint start 1 no cycle;
create sequence public.support_ref_seq as bigint start 1 no cycle;
create sequence public.recall_ref_seq as bigint start 1 no cycle;

-- -----------------------------------------------------------------------------
-- Application settings (single row)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'Axiom Motive' check (char_length(company_name) between 2 and 80),
  legal_name text check (char_length(legal_name) <= 160),
  support_email text check (support_email is null or support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  support_phone text check (char_length(support_phone) <= 40),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  logo_path text,
  privacy_url text check (privacy_url is null or privacy_url ~* '^(https?://|/)'),
  terms_url text check (terms_url is null or terms_url ~* '^(https?://|/)'),
  brand_theme text not null default 'trust_blue' check (brand_theme in ('trust_blue', 'deep_blue', 'teal')),
  languages text[] not null default array['en']::text[],
  serial_prefix text not null default 'AXM' check (serial_prefix ~ '^[A-Z0-9]{2,6}$'),
  -- Physical label layout (millimetres). Validated again in application code.
  label_spec jsonb not null default jsonb_build_object(
    'page', 'A4',
    'labelWidthMm', 50,
    'labelHeightMm', 30,
    'qrSizeMm', 22,
    'marginTopMm', 10,
    'marginLeftMm', 10,
    'gapXMm', 3,
    'gapYMm', 3,
    'qrErrorCorrection', 'Q'
  ),
  -- Thresholds for the explainable repeat-scan risk rules (see verify_part_token).
  risk_thresholds jsonb not null default jsonb_build_object(
    'rapidWindowMinutes', 10,
    'rapidScans', 5,
    'networkWindowHours', 24,
    'distinctNetworks', 3,
    'distinctCountries', 2,
    'lifetimeScans', 50,
    'revokedScans24h', 3,
    'suspiciousScore', 2
  ),
  retention jsonb not null default jsonb_build_object(
    'verificationNetworkDays', 90,
    'supportCaseDays', 365,
    'labelArtifactDays', 14
  ),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Staff
-- -----------------------------------------------------------------------------
create table public.admin_memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (email = lower(email)),
  display_name text not null default '' check (char_length(display_name) <= 120),
  role text not null check (role in ('owner', 'admin', 'production_operator', 'warehouse_operator', 'support_agent', 'auditor')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index admin_memberships_email_key on public.admin_memberships (email);
create index admin_memberships_role_idx on public.admin_memberships (role) where status = 'active';
create trigger admin_memberships_updated_at before update on public.admin_memberships
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null check (sku ~ '^[A-Z0-9][A-Z0-9._-]{0,38}[A-Z0-9]$'),
  part_number text not null check (part_number ~ '^[A-Z0-9][A-Z0-9._/-]{0,38}[A-Z0-9]$'),
  name text not null check (char_length(name) between 2 and 160),
  description text check (char_length(description) <= 4000),
  brand text check (char_length(brand) <= 80),
  category text check (char_length(category) <= 80),
  -- Path inside the PUBLIC product-images bucket (never a private artifact).
  image_path text check (image_path is null or image_path ~ '^products/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_active = (deactivated_at is null))
);
create unique index products_sku_key on public.products (lower(sku));
create unique index products_part_number_key on public.products (lower(part_number));
create index products_name_idx on public.products (lower(name) text_pattern_ops);
create index products_active_idx on public.products (is_active, created_at desc);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Manufacturing batches
-- -----------------------------------------------------------------------------
create table public.manufacturing_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  batch_code text not null check (batch_code ~ '^[A-Z0-9][A-Z0-9._-]{0,38}[A-Z0-9]$'),
  manufacturing_date date not null,
  expected_quantity integer not null check (expected_quantity between 1 and 1000000),
  processing_status text not null default 'planned'
    check (processing_status in ('planned', 'in_production', 'completed', 'cancelled')),
  release_status text not null default 'pending'
    check (release_status in ('pending', 'qc_hold', 'released', 'quarantined')),
  qc_notes text check (char_length(qc_notes) <= 4000),
  notes text check (char_length(notes) <= 4000),
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, product_id),
  check (release_status <> 'released' or approved_at is not null)
);
create unique index manufacturing_batches_code_key on public.manufacturing_batches (lower(batch_code));
create index manufacturing_batches_product_idx on public.manufacturing_batches (product_id, created_at desc);
create index manufacturing_batches_status_idx on public.manufacturing_batches (processing_status, release_status);
create trigger manufacturing_batches_updated_at before update on public.manufacturing_batches
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Individual part units
-- -----------------------------------------------------------------------------
create table public.part_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  batch_id uuid not null,
  serial_number text not null check (serial_number ~ '^[A-Z0-9][A-Z0-9-]{3,38}[A-Z0-9]$'),
  -- Manufacturing / stock lifecycle. Deliberately separate from label_status
  -- and from token status.
  lifecycle_status text not null default 'registered'
    check (lifecycle_status in ('registered', 'qc_passed', 'released', 'quarantined', 'retired')),
  lifecycle_before_quarantine text
    check (lifecycle_before_quarantine in ('registered', 'qc_passed', 'released')),
  -- Physical label progress. `applied` must be confirmed by a human.
  label_status text not null default 'unlabelled'
    check (label_status in ('unlabelled', 'issued', 'printed', 'applied')),
  first_verified_at timestamptz,
  last_verified_at timestamptz,
  scan_count integer not null default 0 check (scan_count >= 0),
  qc_passed_at timestamptz,
  released_at timestamptz,
  quarantined_at timestamptz,
  quarantine_reason text check (char_length(quarantine_reason) <= 1000),
  retired_at timestamptz,
  retired_reason text check (char_length(retired_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (batch_id, product_id) references public.manufacturing_batches (id, product_id) on delete restrict,
  check (lifecycle_status <> 'quarantined' or lifecycle_before_quarantine is not null),
  check ((first_verified_at is null) = (scan_count = 0))
);
create unique index part_units_serial_key on public.part_units (serial_number);
create index part_units_batch_idx on public.part_units (batch_id, lifecycle_status);
create index part_units_batch_label_idx on public.part_units (batch_id, label_status);
create index part_units_product_idx on public.part_units (product_id);
create index part_units_last_verified_idx on public.part_units (last_verified_at desc) where last_verified_at is not null;
create trigger part_units_updated_at before update on public.part_units
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Label jobs (declared before tokens: tokens reference the issuing job)
-- -----------------------------------------------------------------------------
create table public.label_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.manufacturing_batches (id) on delete restrict,
  kind text not null default 'issue' check (kind in ('issue', 'reissue')),
  state text not null default 'queued' check (state in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  requested_quantity integer not null check (requested_quantity > 0),
  units_done integer not null default 0 check (units_done >= 0),
  next_part_no integer not null default 1 check (next_part_no >= 1),
  chunk_size integer not null default 500 check (chunk_size between 1 and 2000),
  label_spec jsonb not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  attempts integer not null default 0,
  cancel_requested boolean not null default false,
  error_summary text check (char_length(error_summary) <= 500),
  -- Private storage prefix + expiry for the generated PDFs. Never a public path.
  artifact_prefix text,
  artifact_expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  check (units_done <= requested_quantity)
);
create unique index label_jobs_idempotency_key on public.label_jobs (idempotency_key);
create index label_jobs_batch_idx on public.label_jobs (batch_id, created_at desc);
create index label_jobs_state_idx on public.label_jobs (state, updated_at) where state in ('queued', 'running');
create trigger label_jobs_updated_at before update on public.label_jobs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tokens (hashes only)
-- -----------------------------------------------------------------------------
create table public.part_tokens (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.part_units (id) on delete restrict,
  -- SHA-256 of the 32-byte random QR token (base64url string form).
  token_hash bytea not null check (octet_length(token_hash) = 32),
  -- SHA-256 of the printed manual fallback code (100 random bits, Crockford base32).
  code_hash bytea not null check (octet_length(code_hash) = 32),
  status text not null default 'active' check (status in ('active', 'revoked', 'replaced')),
  label_job_id uuid references public.label_jobs (id) on delete set null,
  issued_by uuid,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text check (char_length(revocation_reason) <= 500),
  -- Deferred so a replacement can be linked in the same statement batch.
  replaced_by_token_id uuid,
  check ((status = 'active') = (revoked_at is null)),
  check (status = 'active' or revocation_reason is not null),
  check (status <> 'replaced' or replaced_by_token_id is not null),
  constraint part_tokens_replaced_by_fk foreign key (replaced_by_token_id)
    references public.part_tokens (id) on delete restrict deferrable initially deferred
);
create unique index part_tokens_token_hash_key on public.part_tokens (token_hash);
create unique index part_tokens_code_hash_key on public.part_tokens (code_hash);
-- A physical unit may never have two live credentials at once.
create unique index part_tokens_one_active_per_unit on public.part_tokens (unit_id) where status = 'active';
create index part_tokens_unit_idx on public.part_tokens (unit_id, issued_at desc);
create index part_tokens_job_idx on public.part_tokens (label_job_id) where label_job_id is not null;

-- Units allocated to a label job (resumable, idempotent processing).
create table public.label_job_units (
  job_id uuid not null references public.label_jobs (id) on delete cascade,
  unit_id uuid not null references public.part_units (id) on delete restrict,
  position integer not null check (position >= 1),
  part_no integer check (part_no >= 1),
  token_id uuid references public.part_tokens (id) on delete set null,
  processed_at timestamptz,
  primary key (job_id, unit_id),
  check ((processed_at is null) = (token_id is null))
);
create unique index label_job_units_position_key on public.label_job_units (job_id, position);
create index label_job_units_pending_idx on public.label_job_units (job_id, position) where processed_at is null;
create index label_job_units_unit_idx on public.label_job_units (unit_id);

create table public.label_job_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.label_jobs (id) on delete cascade,
  part_no integer not null check (part_no >= 1),
  storage_path text not null,
  units_count integer not null check (units_count > 0),
  first_serial text not null,
  last_serial text not null,
  bytes bigint not null check (bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  unique (job_id, part_no)
);
create index label_job_artifacts_expiry_idx on public.label_job_artifacts (expires_at) where deleted_at is null;

create table public.label_events (
  id bigint generated always as identity primary key,
  unit_id uuid not null references public.part_units (id) on delete restrict,
  token_id uuid references public.part_tokens (id) on delete set null,
  job_id uuid references public.label_jobs (id) on delete set null,
  event_type text not null check (event_type in (
    'issued', 'printed', 'applied', 'damage_reported', 'revoked', 'reissued', 'qc_scanned')),
  actor_id uuid,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index label_events_unit_idx on public.label_events (unit_id, created_at desc);
create index label_events_job_idx on public.label_events (job_id) where job_id is not null;

-- -----------------------------------------------------------------------------
-- Verification events (append-only)
-- -----------------------------------------------------------------------------
create table public.verification_events (
  id bigint generated always as identity primary key,
  unit_id uuid references public.part_units (id) on delete restrict,
  token_id uuid references public.part_tokens (id) on delete restrict,
  result text not null check (result in (
    'recognized_first', 'recognized_repeat', 'suspicious', 'invalid', 'revoked',
    'recalled', 'quarantined', 'not_released', 'retired')),
  -- customer: public scan. qc: internal staff check. automated: obvious bots.
  channel text not null check (channel in ('customer', 'qc', 'automated')),
  credential_kind text check (credential_kind in ('token', 'code')),
  request_id text not null check (char_length(request_id) between 8 and 64),
  -- Salted keyed hash of the client network (never a raw IP). Purged by retention.
  network_hash bytea check (octet_length(network_hash) = 16),
  country char(2) check (country ~ '^[A-Z]{2}$'),
  ua_class text check (ua_class in ('ios', 'android', 'desktop', 'bot', 'other')),
  risk_score smallint not null default 0 check (risk_score >= 0),
  risk_reasons text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index verification_events_created_idx on public.verification_events (created_at desc);
create index verification_events_unit_idx on public.verification_events (unit_id, created_at desc) where unit_id is not null;
create index verification_events_result_idx on public.verification_events (result, created_at desc);
create index verification_events_channel_idx on public.verification_events (channel, created_at desc);
create index verification_events_network_idx on public.verification_events (network_hash, created_at desc) where network_hash is not null;

-- -----------------------------------------------------------------------------
-- Recalls (relational scope tables, no polymorphic references)
-- -----------------------------------------------------------------------------
create table public.recalls (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('RCL-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.recall_ref_seq')::text, 4, '0')),
  title text not null check (char_length(title) between 3 and 160),
  reason text not null check (char_length(reason) between 3 and 4000),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  -- Customer-facing text. Must be explicitly approved before a recall can be active.
  public_instructions text check (char_length(public_instructions) <= 4000),
  instructions_approved_by uuid,
  instructions_approved_at timestamptz,
  issued_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'active' or (
    public_instructions is not null and char_length(btrim(public_instructions)) > 0
    and instructions_approved_at is not null and issued_at is not null)),
  check ((status = 'closed') = (closed_at is not null))
);
create index recalls_status_idx on public.recalls (status);
create trigger recalls_updated_at before update on public.recalls
  for each row execute function public.set_updated_at();

create table public.recall_products (
  recall_id uuid not null references public.recalls (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  primary key (recall_id, product_id)
);
create index recall_products_product_idx on public.recall_products (product_id);
create table public.recall_batches (
  recall_id uuid not null references public.recalls (id) on delete cascade,
  batch_id uuid not null references public.manufacturing_batches (id) on delete restrict,
  primary key (recall_id, batch_id)
);
create index recall_batches_batch_idx on public.recall_batches (batch_id);
create table public.recall_units (
  recall_id uuid not null references public.recalls (id) on delete cascade,
  unit_id uuid not null references public.part_units (id) on delete restrict,
  primary key (recall_id, unit_id)
);
create index recall_units_unit_idx on public.recall_units (unit_id);

-- -----------------------------------------------------------------------------
-- Investigations
-- -----------------------------------------------------------------------------
create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('INV-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.investigation_ref_seq')::text, 4, '0')),
  unit_id uuid references public.part_units (id) on delete restrict,
  batch_id uuid references public.manufacturing_batches (id) on delete restrict,
  origin text not null check (origin in ('risk_rule', 'manual', 'support_case')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved_benign', 'resolved_confirmed', 'dismissed')),
  summary text not null check (char_length(summary) between 3 and 1000),
  risk_reasons text[] not null default '{}'::text[],
  assigned_to uuid,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text check (char_length(resolution_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unit_id is not null or batch_id is not null),
  check ((status in ('open', 'in_review')) = (resolved_at is null)),
  check (status in ('open', 'in_review') or resolution_notes is not null)
);
create unique index investigations_one_open_per_unit on public.investigations (unit_id)
  where unit_id is not null and status in ('open', 'in_review');
create index investigations_status_idx on public.investigations (status, opened_at desc);
create index investigations_assignee_idx on public.investigations (assigned_to) where assigned_to is not null;
create trigger investigations_updated_at before update on public.investigations
  for each row execute function public.set_updated_at();

create table public.investigation_notes (
  id bigint generated always as identity primary key,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  author_id uuid,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index investigation_notes_idx on public.investigation_notes (investigation_id, created_at);

-- -----------------------------------------------------------------------------
-- Support cases (public form -> staff)
-- -----------------------------------------------------------------------------
create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SUP-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.support_ref_seq')::text, 4, '0')),
  kind text not null check (kind in ('question', 'concern', 'suspected_counterfeit', 'recall_enquiry')),
  status text not null default 'new' check (status in ('new', 'open', 'waiting_customer', 'resolved', 'closed')),
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 5 and 4000),
  contact_name text check (char_length(contact_name) <= 120),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (char_length(contact_phone) <= 40),
  -- Free text the customer typed (serial printed on the label). Not trusted.
  serial_reference text check (char_length(serial_reference) <= 60),
  unit_id uuid references public.part_units (id) on delete set null,
  investigation_id uuid references public.investigations (id) on delete set null,
  assigned_to uuid,
  resolution text check (char_length(resolution) <= 4000),
  resolved_at timestamptz,
  -- Personal data is purged/anonymised after this date (retention policy).
  purge_after timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (purged_at is not null or contact_email is not null or contact_phone is not null),
  check ((status in ('resolved', 'closed')) = (resolved_at is not null))
);
create index support_cases_status_idx on public.support_cases (status, created_at desc);
create index support_cases_assignee_idx on public.support_cases (assigned_to) where assigned_to is not null;
create index support_cases_purge_idx on public.support_cases (purge_after) where purge_after is not null;
create trigger support_cases_updated_at before update on public.support_cases
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text not null check (char_length(action) between 3 and 80),
  target_type text check (char_length(target_type) <= 40),
  target_id text check (char_length(target_id) <= 80),
  -- Safe, redacted change metadata only. Never tokens, passwords or secrets.
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

-- -----------------------------------------------------------------------------
-- Distributed rate limiting counters (fixed window)
-- -----------------------------------------------------------------------------
create table public.rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);
