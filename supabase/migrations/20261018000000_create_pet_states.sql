create table if not exists public.pet_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id text not null default 'xing-tuan',
  name text not null default '星团',
  level integer not null default 1 check (level >= 1),
  experience integer not null default 0 check (experience >= 0),
  hunger integer not null default 72 check (hunger between 0 and 100),
  joy integer not null default 72 check (joy between 0 and 100),
  bond integer not null default 10 check (bond between 0 and 100),
  stardust integer not null default 3 check (stardust >= 0),
  star_candy integer not null default 3 check (star_candy >= 0),
  growth_stage text not null default '初生期',
  star_pattern text not null default '尚未显现',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pet_id)
);

-- Make updated_at a server-controlled, strictly increasing optimistic-lock version.
create or replace function public.set_pet_states_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'INSERT' then
    new.updated_at := clock_timestamp();
  else
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 millisecond');
  end if;
  return new;
end;
$function$;

drop trigger if exists pet_states_updated_at on public.pet_states;
create trigger pet_states_updated_at
  before insert or update on public.pet_states
  for each row execute function public.set_pet_states_updated_at();


alter table public.pet_states enable row level security;

drop policy if exists "Users can read their own pet states" on public.pet_states;
create policy "Users can read their own pet states"
  on public.pet_states for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own pet states" on public.pet_states;
create policy "Users can insert their own pet states"
  on public.pet_states for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own pet states" on public.pet_states;
create policy "Users can update their own pet states"
  on public.pet_states for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own pet states" on public.pet_states;
create policy "Users can delete their own pet states"
  on public.pet_states for delete to authenticated
  using (auth.uid() = user_id);

create index if not exists pet_states_user_id_idx on public.pet_states(user_id);

-- The browser uses the authenticated role; RLS above still restricts each row
-- to auth.uid(). Do not rely on project-specific default table grants.
revoke all on table public.pet_states from anon;
grant select, insert, update, delete on table public.pet_states to authenticated;

-- Trusted server-side operations retain their explicit privileges.
grant select, insert, update, delete on table public.pet_states to service_role;
