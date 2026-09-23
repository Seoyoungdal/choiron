begin;
create or replace function public.choiron_admin_add_choir(p_workspace uuid,p_request_id uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; c public.choiron_choirs; n text:=btrim(p_name);
begin
 perform 1 from public.choiron_workspaces where id=p_workspace for update;
 actor:=choir_private.admin_id(p_workspace);
 if p_request_id is null or coalesce(length(n),0) not between 1 and 80 then raise exception '합창단 이름을 1~80자로 입력해 주세요.';end if;
 select * into c from public.choiron_choirs where workspace_id=p_workspace and id=p_request_id;
 if found then
  if c.name<>n or c.status<>'active' then raise exception '요청 정보가 다릅니다. 화면을 다시 열어 주세요.';end if;
  return jsonb_build_object('id',c.id,'name',c.name);
 end if;
 if exists(select 1 from public.choiron_choirs where workspace_id=p_workspace and lower(btrim(name))=lower(n)) then raise exception '이 Workspace에 같은 이름의 합창단이 이미 있습니다.';end if;
 insert into public.choiron_choirs(workspace_id,id,name) values(p_workspace,p_request_id,n) returning * into c;
 insert into public.choiron_memberships(workspace_id,choir_id,member_id,part,roles) values(p_workspace,c.id,actor,'관리',array['member','admin']);
 insert into public.choiron_audit_log(workspace_id,choir_id,actor_id,action,target) values(p_workspace,c.id,actor,'choir.create',c.id::text);
 return jsonb_build_object('id',c.id,'name',c.name);
end $$;
revoke all on function public.choiron_admin_add_choir(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.choiron_admin_add_choir(uuid,uuid,text) to authenticated;
insert into public.choiron_schema_versions(version) values(11) on conflict do nothing;
commit;
select 'ChoirON multiple choirs ready' as result;
