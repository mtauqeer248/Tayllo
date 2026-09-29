-- GDPR helpers: data export (Art. 15/20), erasure (Art. 17), retention (Art. 5(1)(e))

-- Export everything we hold about the calling user as a single JSON document.
create or replace function public.export_my_data()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile',       (select to_jsonb(p) from profiles p where p.id = auth.uid()),
    'consents',      coalesce((select jsonb_agg(c) from consents c where c.user_id = auth.uid()), '[]'),
    'receipts',      coalesce((select jsonb_agg(r) from receipts r where r.user_id = auth.uid()), '[]'),
    'receipt_items', coalesce((select jsonb_agg(i) from receipt_items i join receipts r on r.id = i.receipt_id where r.user_id = auth.uid()), '[]'),
    'corrections',   coalesce((select jsonb_agg(c) from receipt_corrections c where c.user_id = auth.uid()), '[]'),
    'splits',        coalesce((select jsonb_agg(s) from expense_splits s where auth.uid() in (s.payer_id, s.participant_id)), '[]'),
    'bank_connections', coalesce((select jsonb_agg(b) from bank_connections b where b.user_id = auth.uid()), '[]'),
    'bank_transactions', coalesce((select jsonb_agg(t) from bank_transactions t where t.user_id = auth.uid()), '[]'),
    'chat_messages', coalesce((select jsonb_agg(m) from chat_messages m where m.user_id = auth.uid()), '[]')
  );
$$;

-- Erasure is executed by the ledger service with the service role:
--   1. delete storage objects under receipts/<uid>/
--   2. delete auth user (cascades through every table via ON DELETE CASCADE)
--   3. anonymise audit_log rows
create or replace function public.anonymise_audit(uid uuid)
returns void language sql security definer set search_path = public as $$
  update audit_log set user_id = null where user_id = uid;
$$;
revoke all on function public.anonymise_audit(uuid) from public, anon, authenticated;

-- Retention: purge chat history older than 30 days and raw model output older than 1 year.
-- Schedule with pg_cron (enable the extension in Supabase dashboard):
--   select cron.schedule('gdpr-retention', '17 3 * * *', $$select public.run_retention()$$);
create or replace function public.run_retention()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from chat_messages where created_at < now() - interval '30 days';
  update receipts set raw_extraction = null where raw_extraction is not null and created_at < now() - interval '365 days';
  update bank_connections set status = 'expired' where status = 'active' and valid_until < now();
end $$;
revoke all on function public.run_retention() from public, anon, authenticated;

-- Profile auto-creation on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  -- consents captured on the signup form (stored in metadata because no session exists yet)
  insert into public.consents (user_id, purpose, granted, policy_version)
  select new.id, c.key, (c.value)::boolean, coalesce(new.raw_user_meta_data->>'policy_version', 'unknown')
  from jsonb_each_text(coalesce(new.raw_user_meta_data->'consents', '{}'::jsonb)) c
  where c.key in ('terms','privacy','ai_processing','marketing');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lookup used by the ledger service when adding group members (service role only).
create or replace function public.user_id_by_email(e text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(e) limit 1;
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
