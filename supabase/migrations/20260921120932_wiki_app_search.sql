-- Compact, owner-scoped Wiki search. Bodies are fetched only when opening a term.
create or replace function public.wiki_search_entries(
  p_search text default '',
  p_category text default null,
  p_tag text default null,
  p_status text default null,
  p_link_title text default null,
  p_before_time timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 31
)
returns table (
  id uuid, user_id uuid, title text, category text, tags text[], status text,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security invoker set search_path = ''
as $function$
  select w.id, w.user_id, w.title, w.category, w.tags, w.status,
    w.created_at, w.updated_at
  from public.wiki_entries w
  where w.user_id = (select auth.uid())
    and (p_category is null or w.category = p_category)
    and (p_tag is null or w.tags @> array[p_tag])
    and (p_status is null or w.status = p_status)
    and (coalesce(btrim(p_search), '') = '' or
      strpos(lower(w.title), lower(btrim(p_search))) > 0 or
      strpos(lower(w.content), lower(btrim(p_search))) > 0 or
      exists (select 1 from unnest(w.tags) t where strpos(lower(t), lower(btrim(p_search))) > 0))
    and (p_link_title is null or exists (
      select 1 from regexp_matches(w.content, '\[\[([^\]]+)\]\]', 'g') m
      where btrim(m[1]) = p_link_title
    ))
    and (p_before_id is null or
      (coalesce(w.created_at, '1970-01-01'::timestamptz), w.id) <
      (coalesce(p_before_time, '1970-01-01'::timestamptz), p_before_id))
  order by coalesce(w.created_at, '1970-01-01'::timestamptz) desc, w.id desc
  limit greatest(1, least(coalesce(p_limit, 31), 100));
$function$;
revoke all on function public.wiki_search_entries(text,text,text,text,text,timestamptz,uuid,integer) from public, anon;
grant execute on function public.wiki_search_entries(text,text,text,text,text,timestamptz,uuid,integer) to authenticated, service_role;
create index if not exists wiki_entries_owner_created_id_idx
  on public.wiki_entries (user_id, (coalesce(created_at, '1970-01-01'::timestamptz)) desc, id desc);
comment on function public.wiki_search_entries(text,text,text,text,text,timestamptz,uuid,integer)
  is 'App Wiki metadata search and backlinks; literal substring search, stable keyset paging, caller RLS.';
