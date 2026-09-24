-- Story groups for organizing RP sessions
create table if not exists rp_story_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_rp_story_groups_user_id on rp_story_groups(user_id);

-- Junction table linking sessions to story groups
create table if not exists rp_session_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references rp_sessions(id) on delete cascade,
  story_group_id uuid not null references rp_story_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(session_id)
);

create index if not exists idx_rp_session_groups_story_group_id on rp_session_groups(story_group_id);
create index if not exists idx_rp_session_groups_session_id on rp_session_groups(session_id);

-- RLS policies
alter table rp_story_groups enable row level security;
alter table rp_session_groups enable row level security;

create policy "Users can manage their own story groups"
  on rp_story_groups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage session-group links for their own groups"
  on rp_session_groups for all
  using (
    exists (
      select 1 from rp_story_groups
      where rp_story_groups.id = rp_session_groups.story_group_id
        and rp_story_groups.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from rp_story_groups
      where rp_story_groups.id = rp_session_groups.story_group_id
        and rp_story_groups.user_id = auth.uid()
    )
  );

-- Data API 授权（Supabase 2026-10-30 起新表不再自动授权，建表的迁移必须自带 GRANT）
revoke all on table public.rp_story_groups from anon;
revoke all on table public.rp_session_groups from anon;
grant select, insert, update, delete on table public.rp_story_groups to authenticated, service_role;
grant select, insert, update, delete on table public.rp_session_groups to authenticated, service_role;
