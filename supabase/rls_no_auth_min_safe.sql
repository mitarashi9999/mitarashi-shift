-- ==============================================
-- 認証なし運用向け: 最低限安全なRLS設定
-- ==============================================
-- 方針:
-- 1) Supabase Auth を使わない前提
-- 2) すべてのアクセスで x-app-token を必須化
-- 3) 更新系（insert/update/delete）は x-app-write-token を必須化
--
-- 注意:
-- - これは「最低限」の保護です。完全な安全性は Supabase Auth 導入時より低くなります。
-- - read/write token は十分長いランダム値にしてください（32文字以上推奨）。
--
-- 事前に以下を設定:
-- - private.rls_tokens の read_token / write_token
-- - アプリ環境変数:
--   EXPO_PUBLIC_APP_READ_TOKEN
--   EXPO_PUBLIC_APP_WRITE_TOKEN

begin;

-- ------------------------------
-- 0) RLSを有効化
-- ------------------------------
alter table if exists public.profiles enable row level security;
alter table if exists public.shifts enable row level security;
alter table if exists public.chat_rooms enable row level security;
alter table if exists public.direct_room_members enable row level security;
alter table if exists public.messages enable row level security;

-- ------------------------------
-- 1) トークン格納先（private schema）
-- ------------------------------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.rls_tokens (
  id integer primary key check (id = 1),
  read_token text not null,
  write_token text not null,
  updated_at timestamptz not null default now()
);

alter table private.rls_tokens enable row level security;

drop policy if exists "private_tokens_deny_all" on private.rls_tokens;
create policy "private_tokens_deny_all"
on private.rls_tokens
for all
using (false)
with check (false);

-- 初回投入（必ず実値に置換してください）
insert into private.rls_tokens (id, read_token, write_token)
values (1, 'CHANGE_ME_READ_TOKEN_32CHARS_OR_MORE', 'CHANGE_ME_WRITE_TOKEN_32CHARS_OR_MORE')
on conflict (id) do nothing;

-- ------------------------------
-- 2) ヘッダー取得ヘルパー
-- ------------------------------
create or replace function public.request_header(header_name text)
returns text
language sql
stable
as $$
  select coalesce(
    (coalesce(current_setting('request.headers', true), '{}')::jsonb ->> lower(header_name)),
    ''
  );
$$;

create or replace function public.app_read_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.rls_tokens t
    where t.id = 1
      and t.read_token = public.request_header('x-app-token')
  );
$$;

create or replace function public.app_write_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.rls_tokens t
    where t.id = 1
      and t.write_token = public.request_header('x-app-write-token')
  );
$$;

grant execute on function public.request_header(text) to anon, authenticated;
grant execute on function public.app_read_allowed() to anon, authenticated;
grant execute on function public.app_write_allowed() to anon, authenticated;

-- ------------------------------
-- 3) 既存ポリシーを削除
-- ------------------------------
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists "profiles_insert_admin_only" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
drop policy if exists "profiles_delete_admin_only" on public.profiles;

drop policy if exists "shifts_select_self_or_admin" on public.shifts;
drop policy if exists "shifts_insert_admin_only" on public.shifts;
drop policy if exists "shifts_update_admin_only" on public.shifts;
drop policy if exists "shifts_delete_admin_only" on public.shifts;

drop policy if exists "chat_rooms_select_member_or_global" on public.chat_rooms;
drop policy if exists "chat_rooms_insert_admin_only" on public.chat_rooms;

drop policy if exists "direct_room_members_select_member_or_admin" on public.direct_room_members;
drop policy if exists "direct_room_members_manage_admin_only" on public.direct_room_members;

drop policy if exists "messages_select_room_member" on public.messages;
drop policy if exists "messages_insert_room_member" on public.messages;
drop policy if exists "messages_update_sender_or_admin" on public.messages;

-- ------------------------------
-- 4) 認証なし前提ポリシーを作成
-- ------------------------------
create policy "profiles_read_app_token"
on public.profiles
for select
using (public.app_read_allowed());

create policy "profiles_write_app_write_token"
on public.profiles
for all
using (public.app_write_allowed())
with check (public.app_write_allowed());

create policy "shifts_read_app_token"
on public.shifts
for select
using (public.app_read_allowed());

create policy "shifts_write_app_write_token"
on public.shifts
for all
using (public.app_write_allowed())
with check (public.app_write_allowed());

create policy "chat_rooms_read_app_token"
on public.chat_rooms
for select
using (public.app_read_allowed());

create policy "chat_rooms_write_app_write_token"
on public.chat_rooms
for all
using (public.app_write_allowed())
with check (public.app_write_allowed());

create policy "direct_room_members_read_app_token"
on public.direct_room_members
for select
using (public.app_read_allowed());

create policy "direct_room_members_write_app_write_token"
on public.direct_room_members
for all
using (public.app_write_allowed())
with check (public.app_write_allowed());

create policy "messages_read_app_token"
on public.messages
for select
using (public.app_read_allowed());

create policy "messages_write_app_write_token"
on public.messages
for all
using (public.app_write_allowed())
with check (public.app_write_allowed());

-- ------------------------------
-- 5) anon/authenticated 権限
-- ------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to anon, authenticated;
grant select, insert, update, delete on public.shifts to anon, authenticated;
grant select, insert, update, delete on public.chat_rooms to anon, authenticated;
grant select, insert, update, delete on public.direct_room_members to anon, authenticated;
grant select, insert, update, delete on public.messages to anon, authenticated;

commit;

-- 運用メモ:
-- トークン更新時は次を実行:
-- update private.rls_tokens
-- set read_token = 'NEW_READ_TOKEN', write_token = 'NEW_WRITE_TOKEN', updated_at = now()
-- where id = 1;
