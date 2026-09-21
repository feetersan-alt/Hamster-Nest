-- Body and tag comparisons stay in POST JSON, never in long query-string filters.
create or replace function public.wiki_save_entry(p_id uuid, p_fields jsonb, p_base jsonb default null)
returns uuid language plpgsql security invoker set search_path = '' as $function$
declare
  owner_id uuid := auth.uid(); current_row public.wiki_entries; desired jsonb; current_fields jsonb;
  field_tags text[];
begin
  if owner_id is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_id is null or jsonb_typeof(p_fields) is distinct from 'object'
    or jsonb_typeof(p_fields->'title') is distinct from 'string'
    or jsonb_typeof(p_fields->'category') is distinct from 'string'
    or jsonb_typeof(p_fields->'content') is distinct from 'string'
    or jsonb_typeof(p_fields->'tags') is distinct from 'array'
    or coalesce(p_fields->>'status','') not in ('draft','published')
    or btrim(p_fields->>'title') = '' or btrim(p_fields->>'category') = ''
  then raise exception 'Invalid Wiki fields' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_fields->'tags') t where jsonb_typeof(t) <> 'string')
  then raise exception 'Invalid tags' using errcode = '22023'; end if;
  select coalesce(array_agg(t), '{}'::text[]) into field_tags from jsonb_array_elements_text(p_fields->'tags') t;
  desired := jsonb_build_object('title',p_fields->>'title','category',p_fields->>'category','content',p_fields->>'content','tags',field_tags,'status',p_fields->>'status');
  if p_base is null then
    insert into public.wiki_entries(id,user_id,title,category,content,tags,status)
    values(p_id,owner_id,p_fields->>'title',p_fields->>'category',p_fields->>'content',field_tags,p_fields->>'status')
    on conflict(id) do nothing;
  end if;
  select * into current_row from public.wiki_entries where id=p_id and user_id=owner_id for update;
  if not found then raise exception 'Wiki entry is missing or inaccessible' using errcode = '40001'; end if;
  current_fields := jsonb_build_object('title',current_row.title,'category',current_row.category,'content',current_row.content,'tags',current_row.tags,'status',current_row.status);
  if current_fields = desired then return p_id; end if;
  if p_base is null or not (p_base @> jsonb_build_object('id',p_id,'user_id',owner_id))
    or current_fields is distinct from (p_base - 'id' - 'user_id' - 'created_at' - 'updated_at')
    or current_row.updated_at is distinct from (p_base->>'updated_at')::timestamptz
  then raise exception 'Wiki entry changed; review latest version' using errcode = '40001'; end if;
  update public.wiki_entries set title=p_fields->>'title', category=p_fields->>'category',
    content=p_fields->>'content', tags=field_tags, status=p_fields->>'status', updated_at=clock_timestamp()
    where id=p_id and user_id=owner_id;
  return p_id;
end $function$;
revoke all on function public.wiki_save_entry(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.wiki_save_entry(uuid,jsonb,jsonb) to authenticated, service_role;
