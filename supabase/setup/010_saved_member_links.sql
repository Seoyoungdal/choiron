-- After 009. Retrieve the latest choir signup link only after manager authorization.
-- Legacy hash-only links remain valid but their original tokens cannot be recovered.
begin;
alter table public.choiron_member_invites add column if not exists token_value text;
-- Existing table RLS and revoked client grants also protect this column.
create or replace function public.choiron_member_invite_manage(p_workspace uuid,p_choir uuid,p_action text,p_session text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;i public.choiron_member_invites;secret text;
begin
 perform 1 from public.choiron_choirs where workspace_id=p_workspace and id=p_choir for update;
 actor:=choir_private.invite_manager(p_workspace,p_choir,p_session);
 if p_action='create' then
 if (select count(*) from public.choiron_member_invites where workspace_id=p_workspace and choir_id=p_choir and created_at>now()-interval '1 day')>=100 then raise exception '오늘 생성 가능한 링크 수를 초과했습니다.';end if;
 update public.choiron_member_invites set revoked_at=now() where workspace_id=p_workspace and choir_id=p_choir and revoked_at is null;
 secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.choiron_member_invites(workspace_id,choir_id,token_hash,created_by,token_value) values(p_workspace,p_choir,encode(sha256(convert_to(secret,'UTF8')),'hex'),actor,secret) returning * into i;
 insert into public.choiron_audit_log(workspace_id,choir_id,actor_id,action,target) values(p_workspace,p_choir,actor,'member_invite.create',i.id::text);
 return jsonb_build_object('token',secret,'expires_at',i.expires_at);
 elsif p_action='revoke' then
 update public.choiron_member_invites set revoked_at=now() where workspace_id=p_workspace and choir_id=p_choir and revoked_at is null;
 insert into public.choiron_audit_log(workspace_id,choir_id,actor_id,action,target) values(p_workspace,p_choir,actor,'member_invite.revoke',p_choir::text);
 return jsonb_build_object('ok',true);
 elsif p_action='status' then
 select * into i from public.choiron_member_invites where workspace_id=p_workspace and choir_id=p_choir order by created_at desc,id desc limit 1;
 if i.id is null then return jsonb_build_object('active',false,'state','empty');end if;
 if i.revoked_at is not null then secret:='revoked';
 elsif i.expires_at<=now() then secret:='expired';
 elsif i.uses>=500 then secret:='full';
 elsif not exists(select 1 from public.choiron_members m where m.workspace_id=i.workspace_id and m.id=i.created_by and m.status='active' and (m.workspace_admin or exists(select 1 from public.choiron_memberships z where z.workspace_id=m.workspace_id and z.member_id=m.id and z.choir_id=i.choir_id and z.status='active' and 'admin'=any(z.roles)))) then secret:='inactive';
 else secret:='active';end if;
 return jsonb_build_object('active',secret='active','state',secret,'token',i.token_value,'expires_at',i.expires_at,'uses',i.uses,'created_at',i.created_at,'legacy',i.token_value is null);
 end if;
 raise exception '지원하지 않는 요청입니다.';
end $$;


revoke all on function public.choiron_member_invite_manage(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.choiron_member_invite_manage(uuid,uuid,text,text) to anon,authenticated;
insert into public.choiron_schema_versions(version) values(10) on conflict do nothing;
commit;
select 'ChoirON saved member links ready' as result;
