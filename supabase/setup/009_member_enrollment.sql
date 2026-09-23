-- After 008. Member self-enrollment, confined to the choir in a manager-issued link.
begin;
create table if not exists public.choiron_member_invites(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,choir_id uuid not null,
 token_hash text not null unique,created_by uuid not null,created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',revoked_at timestamptz,uses integer not null default 0 check(uses between 0 and 500),
 foreign key(workspace_id,choir_id) references public.choiron_choirs(workspace_id,id),
 foreign key(workspace_id,created_by) references public.choiron_members(workspace_id,id)
);
alter table public.choiron_member_invites enable row level security;
revoke all on public.choiron_member_invites from public,anon,authenticated;
grant select,insert,update,delete on public.choiron_member_invites to service_role;

create or replace function choir_private.invite_manager(w uuid,c uuid,t text) returns uuid
language plpgsql set search_path='' as $$
declare m uuid;
begin
 if not exists(select 1 from public.choiron_workspaces where id=w and status='active') or not exists(select 1 from public.choiron_choirs where workspace_id=w and id=c and status='active') then raise exception '사용할 수 없는 합창단입니다.';end if;
 if auth.uid() is not null then return choir_private.admin_id(w);end if;
 select x.id into m from public.choiron_member_sessions s join public.choiron_members x on x.workspace_id=s.workspace_id and x.id=s.member_id
 join public.choiron_memberships z on z.workspace_id=x.workspace_id and z.member_id=x.id
 where s.token_hash=encode(sha256(convert_to(t,'UTF8')),'hex') and s.expires_at>now() and s.workspace_id=w and x.status='active' and z.choir_id=c and z.status='active' and 'admin'=any(z.roles);
 if m is null then raise exception '해당 합창단 관리자만 가입 링크를 관리할 수 있습니다.' using errcode='42501';end if;
 return m;
end $$;
revoke all on function choir_private.invite_manager(uuid,uuid,text) from public,anon,authenticated;

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
 insert into public.choiron_member_invites(workspace_id,choir_id,token_hash,created_by) values(p_workspace,p_choir,encode(sha256(convert_to(secret,'UTF8')),'hex'),actor) returning * into i;
 insert into public.choiron_audit_log(workspace_id,choir_id,actor_id,action,target) values(p_workspace,p_choir,actor,'member_invite.create',i.id::text);
 return jsonb_build_object('token',secret,'expires_at',i.expires_at);
 elsif p_action='revoke' then
 update public.choiron_member_invites set revoked_at=now() where workspace_id=p_workspace and choir_id=p_choir and revoked_at is null;
 insert into public.choiron_audit_log(workspace_id,choir_id,actor_id,action,target) values(p_workspace,p_choir,actor,'member_invite.revoke',p_choir::text);
 return jsonb_build_object('ok',true);
 elsif p_action='status' then
 select * into i from public.choiron_member_invites where workspace_id=p_workspace and choir_id=p_choir and revoked_at is null and expires_at>now() order by created_at desc limit 1;
 return jsonb_build_object('active',i.id is not null and i.uses<500,'expires_at',i.expires_at,'uses',i.uses);
 end if;
 raise exception '지원하지 않는 요청입니다.';
end $$;

create or replace function public.choiron_member_invite_preview(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.choiron_member_invites;w text;c text;
begin
 if coalesce(p_token,'') !~ '^[a-f0-9]{64}$' then raise exception '가입 링크를 확인해 주세요.';end if;
 select * into i from public.choiron_member_invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and revoked_at is null and expires_at>now() and uses<500;
 if not found then raise exception '가입 링크가 만료되었거나 취소되었습니다. 관리자에게 새 링크를 요청해 주세요.';end if;
 select name into w from public.choiron_workspaces where id=i.workspace_id and status='active';
 select name into c from public.choiron_choirs where workspace_id=i.workspace_id and id=i.choir_id and status='active';
 if w is null or c is null or not exists(select 1 from public.choiron_members m where m.workspace_id=i.workspace_id and m.id=i.created_by and m.status='active' and (m.workspace_admin or exists(select 1 from public.choiron_memberships z where z.workspace_id=m.workspace_id and z.member_id=m.id and z.choir_id=i.choir_id and z.status='active' and 'admin'=any(z.roles)))) then raise exception '더 이상 사용할 수 없는 가입 링크입니다.';end if;
 return jsonb_build_object('workspace_id',i.workspace_id,'workspace_name',w,'choir_name',c,'expires_at',i.expires_at);
end $$;

create or replace function public.choiron_member_enroll(p_token text,p_name text,p_login_id text,p_pin text,p_part text,p_session text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.choiron_member_invites;mid uuid;existing public.choiron_memberships;preview jsonb;
begin
 select * into i from public.choiron_member_invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 -- Same choir lock order as link rotation, then invitation lock.
 perform 1 from public.choiron_choirs where workspace_id=i.workspace_id and id=i.choir_id for update;
 select * into i from public.choiron_member_invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 preview:=public.choiron_member_invite_preview(p_token);
 if coalesce(length(btrim(p_part)),0) not between 1 and 40 then raise exception '파트를 입력해 주세요.';end if;
 if p_session is not null then
 select s.member_id into mid from public.choiron_member_sessions s join public.choiron_members m on m.workspace_id=s.workspace_id and m.id=s.member_id
 where s.token_hash=encode(sha256(convert_to(p_session,'UTF8')),'hex') and s.expires_at>now() and s.workspace_id=i.workspace_id and m.status='active';
 if mid is null then raise exception '이 Workspace의 기존 계정으로 다시 로그인해 주세요.' using errcode='42501';end if;
 else
 if coalesce(length(btrim(p_name)),0) not between 1 and 80 or coalesce(p_login_id,'') !~ '^[가-힣A-Za-z0-9_-]{1,64}$' or coalesce(p_pin,'') !~ '^[0-9]{6,12}$' then raise exception '이름·아이디와 숫자 6~12자리 PIN을 확인해 주세요.';end if;
 -- Serialize registrations of the same login ID across different choir links.
 perform pg_advisory_xact_lock(hashtextextended(i.workspace_id::text||':'||p_login_id,0));
 if exists(select 1 from public.choiron_members where workspace_id=i.workspace_id and login_id=p_login_id) then raise exception '이미 사용 중인 아이디입니다. 다른 아이디를 정하거나 기존 계정으로 참여해 주세요.';end if;
 insert into public.choiron_members(workspace_id,login_id,name) values(i.workspace_id,p_login_id,btrim(p_name)) returning id into mid;
 insert into public.choiron_member_credentials(workspace_id,member_id,pin_hash,must_change) values(i.workspace_id,mid,choir_private.pin_hash(p_pin),false);
 end if;
 select * into existing from public.choiron_memberships where workspace_id=i.workspace_id and choir_id=i.choir_id and member_id=mid;
 if found then
 if existing.status<>'active' then raise exception '휴단·탈퇴 상태는 합창단 관리자에게 문의해 주세요.';end if;
 return jsonb_build_object('workspace_id',i.workspace_id,'already_joined',true);
 end if;
 insert into public.choiron_memberships(workspace_id,choir_id,member_id,part,roles) values(i.workspace_id,i.choir_id,mid,btrim(p_part),array['member']);
 update public.choiron_member_invites set uses=uses+1 where id=i.id;
 insert into public.choiron_audit_log(workspace_id,choir_id,actor_id,action,target) values(i.workspace_id,i.choir_id,mid,'member.enroll',i.id::text);
 return jsonb_build_object('workspace_id',i.workspace_id,'already_joined',false);
end $$;
revoke all on function public.choiron_member_invite_manage(uuid,uuid,text,text),public.choiron_member_invite_preview(text),public.choiron_member_enroll(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.choiron_member_invite_manage(uuid,uuid,text,text),public.choiron_member_invite_preview(text),public.choiron_member_enroll(text,text,text,text,text,text) to anon,authenticated;
insert into public.choiron_schema_versions(version) values(9) on conflict do nothing;
commit;
select 'ChoirON member enrollment ready' as result;
