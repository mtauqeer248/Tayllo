-- AI Expense Scanner — initial schema
-- Supabase project MUST be created in region eu-central-1 (Frankfurt) for GDPR data residency.
-- All money is stored as integer cents (bigint) to avoid rounding errors.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  default_currency varchar(3) not null default 'EUR',
  locale text not null default 'en-IE',
  created_at timestamptz not null default now()
);

-- GDPR: record explicit consents (lawful basis + audit trail)
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('terms','privacy','ai_processing','bank_access','marketing')),
  granted boolean not null,
  policy_version text not null,
  created_at timestamptz not null default now()
);
create index on public.consents (user_id, purpose, created_at desc);

-- ------------------------------------------------------------------
-- Groups (for splitting between friends / flatmates / trips)
-- ------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, -- FK to profiles enables PostgREST embeds
  role text not null default 'member' check (role in ('owner','member')),
  primary key (group_id, user_id)
);

-- security definer helper avoids RLS recursion on group_members
create or replace function public.is_group_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid());
$$;

-- ------------------------------------------------------------------
-- Receipts
-- ------------------------------------------------------------------
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  status text not null default 'processing' check (status in ('processing','ready','needs_review','failed')),
  merchant_name text,
  merchant_vat_id text,
  country_code varchar(2),
  category text default 'other',
  total_cents bigint,
  vat_cents bigint default 0,
  currency varchar(3) not null default 'EUR',
  receipt_date date,
  file_path text,                         -- path in private storage bucket "receipts"
  is_flagged boolean not null default false,
  flag_reason text,
  flags jsonb not null default '[]'::jsonb, -- [{field, code, message}]
  items_confirmed boolean not null default false, -- user accepted total despite item mismatch
  raw_extraction jsonb,                   -- model output, for audit / re-validation
  bank_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.receipts (user_id, receipt_date desc);
create index on public.receipts (user_id) where is_flagged;

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  position int not null,
  description text not null,
  quantity numeric(10,3) default 1,
  price_cents bigint,
  vat_rate numeric(5,2)
);
create index on public.receipt_items (receipt_id);

-- Correction history: what the user changed after a flag
create table public.receipt_corrections (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Splits
-- ------------------------------------------------------------------
create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  payer_id uuid not null references auth.users(id) on delete cascade,
  participant_id uuid not null references auth.users(id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),
  mode text not null check (mode in ('equal','by_item','custom')),
  status text not null default 'pending' check (status in ('pending','settled')),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (receipt_id, participant_id)
);
create index on public.expense_splits (payer_id, status);
create index on public.expense_splits (participant_id, status);

-- ------------------------------------------------------------------
-- Open banking (Enable Banking, PSD2)
-- ------------------------------------------------------------------
create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'enable_banking',
  aspsp_name text not null,
  aspsp_country varchar(2) not null,
  session_id text,                         -- provider session id (not a credential)
  account_uids text[] not null default '{}',
  valid_until timestamptz not null,        -- PSD2 consent expiry (max 180 days)
  status text not null default 'active' check (status in ('pending','active','expired','revoked')),
  created_at timestamptz not null default now()
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  external_id text not null,
  amount_cents bigint not null,            -- positive = money out
  currency varchar(3) not null,
  booking_date date not null,
  description text,
  matched_receipt_id uuid references public.receipts(id) on delete set null,
  match_score numeric(4,3),
  created_at timestamptz not null default now(),
  unique (connection_id, external_id)
);
create index on public.bank_transactions (user_id, booking_date desc);

alter table public.receipts
  add constraint receipts_bank_tx_fk foreign key (bank_transaction_id)
  references public.bank_transactions(id) on delete set null;

-- ------------------------------------------------------------------
-- Chat history (for chatbot context) — auto-purged after 30 days
-- ------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.chat_messages (user_id, created_at desc);

-- ------------------------------------------------------------------
-- Audit log (GDPR Art. 30 record of processing; no payload PII)
-- ------------------------------------------------------------------
create table public.audit_log (
  id bigserial primary key,
  user_id uuid,                            -- kept null after erasure
  action text not null,
  entity text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- updated_at trigger
-- ------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger receipts_touch before update on public.receipts
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------
-- Row Level Security — every table
-- ------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.consents            enable row level security;
alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.receipts            enable row level security;
alter table public.receipt_items       enable row level security;
alter table public.receipt_corrections enable row level security;
alter table public.expense_splits      enable row level security;
alter table public.bank_connections    enable row level security;
alter table public.bank_transactions   enable row level security;
alter table public.chat_messages       enable row level security;
alter table public.audit_log           enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "group co-members can see profile" on public.profiles for select using (
  exists (select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
          where a.user_id = auth.uid() and b.user_id = profiles.id));

create policy "own consents read" on public.consents for select using (user_id = auth.uid());
create policy "own consents insert" on public.consents for insert with check (user_id = auth.uid());

create policy "members see group" on public.groups for select using (public.is_group_member(id));
create policy "create group" on public.groups for insert with check (created_by = auth.uid());
create policy "members see members" on public.group_members for select using (public.is_group_member(group_id));

create policy "own receipts" on public.receipts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "group receipts read" on public.receipts for select
  using (group_id is not null and public.is_group_member(group_id));

create policy "items of visible receipts" on public.receipt_items for select using (
  exists (select 1 from public.receipts r where r.id = receipt_id));
create policy "items of own receipts write" on public.receipt_items for all using (
  exists (select 1 from public.receipts r where r.id = receipt_id and r.user_id = auth.uid()));

create policy "own corrections" on public.receipt_corrections for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "view relevant splits" on public.expense_splits for select
  using (auth.uid() in (payer_id, participant_id));
-- writes go through the ledger service (service role) only

create policy "own bank connections" on public.bank_connections for select using (user_id = auth.uid());
create policy "own bank transactions" on public.bank_transactions for select using (user_id = auth.uid());
create policy "own chat" on public.chat_messages for select using (user_id = auth.uid());
-- audit_log: no policies => not readable by clients

-- ------------------------------------------------------------------
-- Storage: private bucket for receipt images (EU region inherits project)
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "own receipt files read" on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own receipt files write" on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own receipt files delete" on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
