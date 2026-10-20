-- 줄타는 자객 (rope assassin): online rankings, stage gallery and cloud saves.
-- Clients never write tables directly: every write goes through a SECURITY DEFINER function
-- that checks the player's secret (stored only as a sha256 hash).
create table public.ra_players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 16),
  secret_hash text not null,
  created_at timestamptz not null default now()
);
create table public.ra_scores (
  player_id uuid not null references public.ra_players(id) on delete cascade,
  board text not null check (board ~ '^(lv:[0-2]:[0-9]{1,4}|boss:[0-2]:[0-9]{1,3}|bonus:[0-2]|tower:[0-2])$'),
  value double precision not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, board)
);
create index ra_scores_board_value on public.ra_scores (board, value);
create table public.ra_stages (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.ra_players(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  code text not null check (char_length(code) between 8 and 20000),
  plays integer not null default 0,
  likes integer not null default 0,
  created_at timestamptz not null default now()
);
create index ra_stages_created on public.ra_stages (created_at desc);
create index ra_stages_likes on public.ra_stages (likes desc);
create index ra_stages_player on public.ra_stages (player_id);
create table public.ra_likes (
  stage_id bigint not null references public.ra_stages(id) on delete cascade,
  player_id uuid not null references public.ra_players(id) on delete cascade,
  primary key (stage_id, player_id)
);
create index ra_likes_player on public.ra_likes (player_id);
create table public.ra_saves (
  player_id uuid primary key references public.ra_players(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
-- RLS on with no policies: anon/authenticated can't touch the tables, only the functions below.
alter table public.ra_players enable row level security;
alter table public.ra_scores enable row level security;
alter table public.ra_stages enable row level security;
alter table public.ra_likes enable row level security;
alter table public.ra_saves enable row level security;

create or replace function public.ra_auth(p_id uuid, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.ra_players where id = p_id
                 and secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')) then
    raise exception 'bad credentials' using errcode = '28000';
  end if;
end $$;

create or replace function public.ra_register(p_name text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_secret text := encode(extensions.gen_random_bytes(18), 'hex'); v_id uuid;
begin
  insert into public.ra_players (name, secret_hash)
  values (left(coalesce(nullif(btrim(p_name), ''), '이름 없는 자객'), 16), encode(extensions.digest(v_secret, 'sha256'), 'hex'))
  returning id into v_id;
  return json_build_object('id', v_id, 'secret', v_secret);
end $$;

create or replace function public.ra_rename(p_id uuid, p_secret text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ra_auth(p_id, p_secret);
  update public.ra_players set name = left(btrim(p_name), 16) where id = p_id and char_length(btrim(p_name)) > 0;
end $$;

-- Times (lv/boss/bonus) keep the lowest value; tower keeps the highest floor.
create or replace function public.ra_submit(p_id uuid, p_secret text, p_board text, p_value double precision) returns void
language plpgsql security definer set search_path = '' as $$
declare v_high boolean := p_board like 'tower:%';
begin
  perform public.ra_auth(p_id, p_secret);
  if p_value is null or p_value <= 0 or p_value > 100000 or (not v_high and p_value < 1) then
    raise exception 'bad value';
  end if;
  insert into public.ra_scores as s (player_id, board, value) values (p_id, p_board, p_value)
  on conflict (player_id, board) do update set value = excluded.value, updated_at = now()
  where (v_high and excluded.value > s.value) or (not v_high and excluded.value < s.value);
end $$;

create or replace function public.ra_board(p_board text, p_id uuid default null) returns json
language sql security definer set search_path = '' stable as $$
  with ranked as (
    select s.player_id, p.name, s.value,
           rank() over (order by case when p_board like 'tower:%' then -s.value else s.value end) as rk
    from public.ra_scores s join public.ra_players p on p.id = s.player_id
    where s.board = p_board
  )
  select json_build_object(
    'top', coalesce((select json_agg(json_build_object('rank', rk, 'name', name, 'value', value, 'me', player_id is not distinct from p_id) order by rk)
                     from (select * from ranked order by rk limit 20) t), '[]'::json),
    'me', (select json_build_object('rank', rk, 'value', value) from ranked where player_id = p_id),
    'total', (select count(*) from ranked));
$$;

create or replace function public.ra_upload(p_id uuid, p_secret text, p_name text, p_code text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform public.ra_auth(p_id, p_secret);
  if (select count(*) from public.ra_stages where player_id = p_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many uploads today';
  end if;
  insert into public.ra_stages (player_id, name, code)
  values (p_id, left(coalesce(nullif(btrim(p_name), ''), '이름 없는 막'), 24), p_code)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ra_gallery(p_sort text default 'new', p_offset int default 0, p_id uuid default null) returns json
language sql security definer set search_path = '' stable as $$
  select coalesce(json_agg(r), '[]'::json) from (
    select st.id, st.name, p.name as author, st.plays, st.likes, st.created_at,
           coalesce(st.player_id = p_id, false) as mine,
           exists (select 1 from public.ra_likes l where l.stage_id = st.id and l.player_id = p_id) as liked
    from public.ra_stages st join public.ra_players p on p.id = st.player_id
    order by case when p_sort = 'top' then st.likes end desc nulls last,
             case when p_sort = 'played' then st.plays end desc nulls last,
             st.created_at desc
    limit 30 offset greatest(0, least(p_offset, 10000))
  ) r;
$$;

create or replace function public.ra_stage(p_stage bigint) returns json
language plpgsql security definer set search_path = '' as $$
declare v json;
begin
  update public.ra_stages set plays = plays + 1 where id = p_stage;
  select json_build_object('id', st.id, 'name', st.name, 'author', p.name, 'code', st.code) into v
  from public.ra_stages st join public.ra_players p on p.id = st.player_id where st.id = p_stage;
  return v;
end $$;

create or replace function public.ra_like(p_id uuid, p_secret text, p_stage bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  perform public.ra_auth(p_id, p_secret);
  if exists (select 1 from public.ra_likes where stage_id = p_stage and player_id = p_id) then
    delete from public.ra_likes where stage_id = p_stage and player_id = p_id;
    update public.ra_stages set likes = greatest(0, likes - 1) where id = p_stage returning likes into v;
  else
    insert into public.ra_likes (stage_id, player_id) values (p_stage, p_id);
    update public.ra_stages set likes = likes + 1 where id = p_stage returning likes into v;
  end if;
  return v;
end $$;

create or replace function public.ra_delete_stage(p_id uuid, p_secret text, p_stage bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ra_auth(p_id, p_secret);
  delete from public.ra_stages where id = p_stage and player_id = p_id;
end $$;

create or replace function public.ra_save_put(p_id uuid, p_secret text, p_data jsonb) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v timestamptz;
begin
  perform public.ra_auth(p_id, p_secret);
  if pg_column_size(p_data) > 400000 then raise exception 'save too large'; end if;
  insert into public.ra_saves (player_id, data) values (p_id, p_data)
  on conflict (player_id) do update set data = excluded.data, updated_at = now()
  returning updated_at into v;
  return v;
end $$;

create or replace function public.ra_save_get(p_id uuid, p_secret text) returns json
language plpgsql security definer set search_path = '' as $$
declare v json;
begin
  perform public.ra_auth(p_id, p_secret);
  select json_build_object('data', s.data, 'updated_at', s.updated_at, 'name', p.name) into v
  from public.ra_players p left join public.ra_saves s on s.player_id = p.id where p.id = p_id;
  return v;
end $$;

-- Only the public entry points are callable from the browser; ra_auth stays internal.
revoke all on function public.ra_auth(uuid, text) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['ra_register(text)', 'ra_rename(uuid,text,text)', 'ra_submit(uuid,text,text,double precision)',
    'ra_board(text,uuid)', 'ra_upload(uuid,text,text,text)', 'ra_gallery(text,int,uuid)', 'ra_stage(bigint)',
    'ra_like(uuid,text,bigint)', 'ra_delete_stage(uuid,text,bigint)', 'ra_save_put(uuid,text,jsonb)', 'ra_save_get(uuid,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
