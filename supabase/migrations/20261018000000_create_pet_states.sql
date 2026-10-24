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

-- Explicit Data API privileges for trusted server-side operations.
grant select, insert, update, delete on table public.pet_states to service_role;
