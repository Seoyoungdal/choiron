-- Apply after 006 (007 is optional and superseded). No data deletion.
begin;
alter table public.choiron_invitations drop constraint if exists choiron_invitations_created_by_fkey;
alter table public.choiron_invitations add constraint choiron_invitations_created_by_fkey foreign key(created_by) references auth.users(id);
alter table public.choiron_invitations add column if not exists handoff_from uuid references auth.users(id);
alter table public.choiron_admin_accounts add column if not exists revoked_at timestamptz;
alter table public.choiron_invitations add column if not exists target_workspace_id uuid references public.choiron_workspaces(id);

create or replace function public.choiron_operator_approve(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception '수동 승인은 사용하지 않습니다. 새 초대 링크를 전달해 주세요.';end $$;
revoke all on function public.choiron_operator_approve(uuid) from public,anon,authenticated;

create or replace function public.choiron_operator_overview()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.choiron_operators where auth_user_id=auth.uid()) then raise exception '운영자 권한이 필요합니다.' using errcode='42501';end if;
 return jsonb_build_object('access_mode','direct_link',
 'workspaces',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'status',w.status,'admins',(
 select coalesce(jsonb_agg(jsonb_build_object('auth_id',a.auth_user_id,'name',m.name,'email',u.email,'revoked_at',a.revoked_at) order by m.name),'[]'::jsonb)
 from public.choiron_admin_accounts a join public.choiron_members m on m.workspace_id=a.workspace_id and m.id=a.member_id join auth.users u on u.id=a.auth_user_id where a.workspace_id=w.id
 )) order by w.created_at desc) from public.choiron_workspaces w),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'workspace_name',workspace_name,'email',intended_email,'expires_at',expires_at,'accepted_at',accepted_at,'revoked_at',revoked_at,'target_workspace_id',target_workspace_id) order by created_at desc) from public.choiron_invitations),'[]'::jsonb));
end $$;

create or replace function public.choiron_operator_remove_admin(p_workspace uuid,p_auth_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare mid uuid; oldrev timestamptz;
begin
 if not exists(select 1 from public.choiron_operators where auth_user_id=auth.uid()) then raise exception '운영자 권한이 필요합니다.' using errcode='42501';end if;
 perform 1 from public.choiron_workspaces where id=p_workspace for update;
 select member_id,revoked_at into mid,oldrev from public.choiron_admin_accounts where workspace_id=p_workspace and auth_user_id=p_auth_id for update;
 if not found then raise exception '관리자를 찾을 수 없습니다.';end if;
 if oldrev is not null then return true;end if;
 update public.choiron_admin_accounts set revoked_at=now() where workspace_id=p_workspace and auth_user_id=p_auth_id;
 update public.choiron_members set workspace_admin=false,status='paused' where workspace_id=p_workspace and id=mid;
 update public.choiron_memberships set status='paused',roles=array['member'] where workspace_id=p_workspace and member_id=mid;
 delete from public.choiron_member_sessions where workspace_id=p_workspace and member_id=mid;
 update public.choiron_invitations set revoked_at=coalesce(revoked_at,now()) where accepted_workspace_id=p_workspace and accepted_by_auth_id=p_auth_id;
 update public.choiron_invitations set revoked_at=coalesce(revoked_at,now()) where target_workspace_id=p_workspace and accepted_at is null;
 insert into public.choiron_audit_log(workspace_id,action,target,after_value) values(p_workspace,'admin.revoke',p_auth_id::text,jsonb_build_object('operator',auth.uid()));
 return true;
end $$;

create or replace function public.choiron_operator_transfer_invite(p_workspace uuid,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.choiron_workspaces; result jsonb;
begin
 if not exists(select 1 from public.choiron_operators where auth_user_id=auth.uid()) then raise exception '운영자 권한이 필요합니다.' using errcode='42501';end if;
 select * into w from public.choiron_workspaces where id=p_workspace and status='active' for update;
 if not found then raise exception '운영 중인 Workspace를 확인해 주세요.';end if;
 if exists(select 1 from public.choiron_admin_accounts where workspace_id=p_workspace and revoked_at is null) then raise exception '기존 관리자 권한을 먼저 취소해 주세요.';end if;
 result:=public.choiron_operator_invite(w.name,p_email);
 update public.choiron_invitations set revoked_at=coalesce(revoked_at,now()) where target_workspace_id=p_workspace and accepted_at is null;
 update public.choiron_invitations set target_workspace_id=p_workspace where id=(result->>'id')::uuid;
 return result;
end $$;

create or replace function public.choiron_invite_preview(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.choiron_invitations;
begin
 if coalesce(p_token,'') !~ '^[a-f0-9]{64}$' then raise exception '초대 링크를 확인해 주세요.';end if;
 select * into i from public.choiron_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found or i.revoked_at is not null or i.accepted_at is not null or i.expires_at<=now() then raise exception '만료되었거나 사용·취소된 초대입니다. 새 링크를 요청해 주세요.';end if;
 return jsonb_build_object('access_mode','direct_link','workspace_name',i.workspace_name,'email',i.intended_email,'transfer',i.target_workspace_id is not null);
end $$;

create or replace function public.choiron_accept_invite(p_token text,p_admin_name text,p_login_id text,p_choir_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.choiron_invitations; u uuid:=auth.uid(); mail text;wid uuid;mid uuid;cid uuid;
begin
 if u is null then raise exception '로그인이 필요합니다.' using errcode='42501';end if;
 select lower(email) into mail from auth.users where id=u;
 if coalesce(p_token,'') !~ '^[a-f0-9]{64}$' then raise exception '초대 링크를 확인해 주세요.';end if;
 select * into i from public.choiron_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 -- Lock Workspace before invitation, matching cancellation/transfer lock order.
 if i.target_workspace_id is not null then perform 1 from public.choiron_workspaces where id=i.target_workspace_id for update;end if;
 select * into i from public.choiron_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or mail is distinct from i.intended_email then raise exception '초대받은 이메일로 로그인해 주세요.' using errcode='42501';end if;
 if i.revoked_at is not null then raise exception '취소된 초대입니다.';end if;
 if i.accepted_at is not null then
 if i.accepted_by_auth_id=u and exists(select 1 from public.choiron_admin_accounts a join public.choiron_members m on m.workspace_id=a.workspace_id and m.id=a.member_id where a.auth_user_id=u and a.workspace_id=i.accepted_workspace_id and a.revoked_at is null and m.workspace_admin and m.status='active') then return jsonb_build_object('id',i.accepted_workspace_id,'name',i.workspace_name);end if;
 raise exception '더 이상 사용할 수 없는 초대입니다.';end if;
 if i.expires_at<=now() then raise exception '만료된 초대입니다.';end if;
 if coalesce(length(btrim(p_admin_name)),0) not between 1 and 80 or coalesce(p_login_id,'') !~ '^[가-힣A-Za-z0-9_-]{1,64}$' then raise exception '이름과 아이디를 확인해 주세요.';end if;
 wid:=i.target_workspace_id;
 if wid is null then
 if coalesce(length(btrim(p_choir_name)),0) not between 1 and 80 then raise exception '찬양대 이름을 확인해 주세요.';end if;
 wid:=gen_random_uuid();insert into public.choiron_workspaces(id,code,name) values(wid,'w_'||replace(wid::text,'-',''),i.workspace_name);
 else
 if not exists(select 1 from public.choiron_workspaces where id=wid and status='active') then raise exception '사용할 수 없는 Workspace입니다.';end if;
 if i.handoff_from is not null then
 if not exists(select 1 from public.choiron_admin_accounts a join public.choiron_members m on m.workspace_id=a.workspace_id and m.id=a.member_id where a.workspace_id=wid and a.auth_user_id=i.handoff_from and a.revoked_at is null and m.workspace_admin and m.status='active') or u=i.handoff_from then raise exception '인계 권한이 만료되었거나 같은 계정입니다.';end if;
 else
 if exists(select 1 from public.choiron_admin_accounts where workspace_id=wid and revoked_at is null) then raise exception '이미 다른 관리자가 인수했습니다.';end if;
 end if;
 end if;
 select member_id into mid from public.choiron_admin_accounts where workspace_id=wid and auth_user_id=u;
 if mid is null then
 if exists(select 1 from public.choiron_members where workspace_id=wid and login_id=p_login_id) then raise exception '사용 중인 아이디입니다. 다른 아이디로 입력해 주세요.';end if;
 insert into public.choiron_members(workspace_id,login_id,name,workspace_admin) values(wid,p_login_id,btrim(p_admin_name),true) returning id into mid;
 insert into public.choiron_admin_accounts(auth_user_id,workspace_id,member_id) values(u,wid,mid);
 else
 update public.choiron_members set name=btrim(p_admin_name),workspace_admin=true,status='active' where workspace_id=wid and id=mid;
 update public.choiron_admin_accounts set revoked_at=null where workspace_id=wid and auth_user_id=u;
 end if;
 if i.target_workspace_id is null then insert into public.choiron_choirs(workspace_id,name) values(wid,btrim(p_choir_name)) returning id into cid;end if;
 insert into public.choiron_memberships(workspace_id,choir_id,member_id,part,roles)
 select wid,c.id,mid,'관리',array['member','admin'] from public.choiron_choirs c where c.workspace_id=wid and c.status='active'
 on conflict(workspace_id,choir_id,member_id) do update set status='active',roles=array['member','admin'];
 if i.handoff_from is not null then
 update public.choiron_members set workspace_admin=false,status='paused' where workspace_id=wid and id in(select member_id from public.choiron_admin_accounts where workspace_id=wid and auth_user_id=i.handoff_from);
 update public.choiron_memberships set status='paused',roles=array['member'] where workspace_id=wid and member_id in(select member_id from public.choiron_admin_accounts where workspace_id=wid and auth_user_id=i.handoff_from);
 delete from public.choiron_member_sessions where workspace_id=wid and member_id in(select member_id from public.choiron_admin_accounts where workspace_id=wid and auth_user_id=i.handoff_from);
 update public.choiron_admin_accounts set revoked_at=now() where workspace_id=wid and auth_user_id=i.handoff_from;
 update public.choiron_invitations set revoked_at=coalesce(revoked_at,now()) where accepted_workspace_id=wid and accepted_by_auth_id=i.handoff_from;
 end if;
 update public.choiron_invitations set revoked_at=coalesce(revoked_at,now()) where target_workspace_id=wid and id<>i.id and accepted_at is null;
 update public.choiron_invitations set accepted_at=now(),accepted_by_auth_id=u,accepted_workspace_id=wid where id=i.id;
 insert into public.choiron_audit_log(workspace_id,actor_id,action,target) values(wid,mid,case when i.target_workspace_id is null then 'invite.accept' else 'admin.transfer' end,i.id::text);
 return jsonb_build_object('id',wid,'name',i.workspace_name);
end $$;
revoke all on function public.choiron_operator_remove_admin(uuid,uuid),public.choiron_operator_transfer_invite(uuid,text) from public,anon,authenticated;
grant execute on function public.choiron_operator_remove_admin(uuid,uuid),public.choiron_operator_transfer_invite(uuid,text) to authenticated;

create or replace function public.choiron_admin_handoff(p_workspace uuid,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;secret text;iid uuid;wname text;
begin
 perform 1 from public.choiron_workspaces where id=p_workspace for update;
 actor:=choir_private.admin_id(p_workspace);
 if coalesce(p_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>254 then raise exception '후임자 이메일을 확인해 주세요.';end if;
 if exists(select 1 from auth.users where id=auth.uid() and lower(email)=lower(btrim(p_email))) then raise exception '본인에게 인계할 수 없습니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from public.choiron_invitations where created_by=auth.uid() and created_at>now()-interval '1 day')>=100 then raise exception '오늘 생성 가능한 링크 수를 초과했습니다.';end if;
 select name into wname from public.choiron_workspaces where id=p_workspace;
 update public.choiron_invitations set revoked_at=coalesce(revoked_at,now()) where target_workspace_id=p_workspace and accepted_at is null;
 secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.choiron_invitations(token_hash,workspace_name,intended_email,created_by,expires_at,target_workspace_id,handoff_from)
 values(encode(sha256(convert_to(secret,'UTF8')),'hex'),wname,lower(btrim(p_email)),auth.uid(),now()+interval '7 days',p_workspace,auth.uid()) returning id into iid;
 return jsonb_build_object('id',iid,'token',secret);
end $$;
create or replace function public.choiron_admin_cancel_handoff(p_workspace uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.choiron_workspaces where id=p_workspace for update;
 perform choir_private.admin_id(p_workspace);
 update public.choiron_invitations set revoked_at=coalesce(revoked_at,now()) where target_workspace_id=p_workspace and handoff_from=auth.uid() and accepted_at is null;
 return true;
end $$;
revoke all on function public.choiron_admin_handoff(uuid,text),public.choiron_admin_cancel_handoff(uuid) from public,anon,authenticated;
grant execute on function public.choiron_admin_handoff(uuid,text),public.choiron_admin_cancel_handoff(uuid) to authenticated;

create or replace function choir_private.admin_id(w uuid) returns uuid language plpgsql set search_path='' as $$
declare m uuid;
begin
 select a.member_id into m from public.choiron_admin_accounts a
 join public.choiron_members x on x.workspace_id=a.workspace_id and x.id=a.member_id
 join public.choiron_workspaces z on z.id=a.workspace_id
 where a.auth_user_id=auth.uid() and a.workspace_id=w and a.revoked_at is null and x.workspace_admin and x.status='active' and z.status='active';
 if m is null then raise exception '이 Workspace의 관리자 권한이 필요합니다.' using errcode='42501'; end if;
 return m;
end $$;


insert into public.choiron_schema_versions(version) values(8) on conflict do nothing;
commit;
select 'ChoirON direct invitations and administrator transfer ready' as result;

