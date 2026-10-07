-- Run in the existing project's Supabase SQL Editor. No changes to city_saves.
-- Team records are accessible only through privileged dashboard/admin access.
begin;
create table if not exists public.player_feedback (
    id uuid primary key,
    device_id uuid not null,
    user_id uuid references auth.users(id) on delete set null,
    category text not null check (category in ('balance', 'bug', 'idea', 'other')),
    rating smallint check (rating between 1 and 5),
    message text not null check (char_length(btrim(message)) between 10 and 2000),
    stage smallint not null check (stage between 1 and 5),
    play_seconds integer not null check (play_seconds between 0 and 1000000000),
    build text not null check (char_length(build) between 1 and 64),
    source text not null check (source in ('manual', 'prompt')),
    status text not null default 'new' check (status in ('new', 'reviewed', 'planned', 'resolved')),
    team_notes text not null default '',
    created_at timestamptz not null default now()
);
create index if not exists player_feedback_device_time on public.player_feedback(device_id, created_at);
create index if not exists player_feedback_user_time on public.player_feedback(user_id, created_at);
alter table public.player_feedback enable row level security;
revoke all on public.player_feedback from public, anon, authenticated;
-- No SELECT/UPDATE policy for players: comments, team notes and account IDs stay private.
create or replace function public.submit_player_feedback(
    p_id uuid, p_device_id uuid, p_category text, p_rating integer, p_message text,
    p_stage integer, p_play_seconds integer, p_build text, p_source text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare player_id uuid := auth.uid();
begin
    if p_id is null or p_device_id is null or p_message is null or char_length(btrim(p_message)) not between 10 and 2000
        or p_category is null or p_category not in ('balance', 'bug', 'idea', 'other')
        or (p_rating is not null and p_rating not between 1 and 5)
        or p_stage is null or p_stage not between 1 and 5
        or p_play_seconds is null or p_play_seconds not between 0 and 1000000000
        or p_build is null or char_length(p_build) not between 1 and 64
        or p_source is null or p_source not in ('manual', 'prompt') then
        raise exception 'Invalid feedback.' using errcode = '22023';
    end if;
    -- Stable request ID makes retries idempotent; never return another player's content.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_device_id::text, 0));
    if player_id is not null then
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('feedback-user:' || player_id::text, 0));
    end if;
    if exists (select 1 from public.player_feedback where id = p_id and device_id = p_device_id
        and user_id is not distinct from player_id and message = btrim(p_message)
        and category = p_category and rating is not distinct from p_rating
        and stage = p_stage and play_seconds = p_play_seconds and build = p_build and source = p_source) then return p_id; end if;
    if (select count(*) from public.player_feedback where created_at > now() - interval '1 day'
        and (device_id = p_device_id or (player_id is not null and user_id = player_id))) >= 10 then
        raise exception 'Daily feedback limit reached.' using errcode = 'P0001';
    end if;
    insert into public.player_feedback(id, device_id, user_id, category, rating, message, stage, play_seconds, build, source)
        values(p_id, p_device_id, player_id, p_category, p_rating, btrim(p_message), p_stage, p_play_seconds, p_build, p_source);
    return p_id;
end;
$$;
revoke all on function public.submit_player_feedback(uuid, uuid, text, integer, text, integer, integer, text, text) from public;
grant execute on function public.submit_player_feedback(uuid, uuid, text, integer, text, integer, integer, text, text) to anon, authenticated;
commit;
