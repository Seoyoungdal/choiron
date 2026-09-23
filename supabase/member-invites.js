import {esc} from './ui.js';
export function invitePanel({host,rpc,workspace,choir,label,session=null}){
 host.innerHTML=`<h2>단원 가입 링크</h2><p>${esc(label)}에 가입할 단원에게 링크를 복사해 보내 주세요. 이메일 인증 없이 가입합니다.</p><p>만든 링크는 이곳에서 다시 확인하고 복사할 수 있습니다. 사용 기간은 7일, 최대 500명입니다.</p><div class="toolbar"><button type="button" class="btn" data-invite-action="create">가입 링크 만들기</button><button type="button" class="btn secondary" data-invite-action="status">링크 다시 불러오기</button><button type="button" class="btn secondary" data-invite-action="revoke">가입 링크 취소</button></div><div data-invite-result></div><p role="status" data-invite-notice></p>`;
 let busy=false,link='',active=false,known=false;
 const notice=host.querySelector('[data-invite-notice]'),result=host.querySelector('[data-invite-result]');
 const request=action=>rpc('choiron_member_invite_manage',{p_workspace:workspace,p_choir:choir,p_action:action,p_session:session});
 function show(r){
  known=true;active=!!r.active;link='';
  const states={active:'사용 가능',expired:'기간 만료',revoked:'취소됨',full:'가입 가능 인원 소진',inactive:'발급 관리자 권한 해제',empty:'아직 만든 링크가 없습니다.'};
  const state=r.state||(r.active?'active':'empty');
  if(r.token){const url=new URL('./member-join.html',location.href);url.hash='invite='+r.token;link=url.href;}
  result.innerHTML=`<p><strong>${esc(states[state]||'상태 확인 필요')}</strong>${r.expires_at?` · 만료 ${esc(new Date(r.expires_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}`:''}${r.uses!=null?` · 가입 ${Number(r.uses)}명`:''}</p>${link?`<label class="field">가입 링크<input readonly aria-label="가입 링크" value="${esc(link)}"></label><button type="button" class="btn secondary" data-invite-action="copy">가입 링크 복사</button>`:''}`;
  host.querySelector('[data-invite-action=create]').textContent=state==='empty'?'가입 링크 만들기':'새 가입 링크 만들기';
  if(r.active&&!r.token)notice.textContent='이전 방식으로 만든 링크는 다시 표시할 수 없습니다. 새 링크를 한 번 만들면 이후에는 여기서 다시 확인할 수 있습니다. 저장 설정(010)이 적용되어 있어야 합니다.';
  else notice.textContent=link?(active?'저장된 링크입니다. 언제든 이 화면에서 다시 복사할 수 있습니다.':'이 링크로는 새로 가입할 수 없습니다. 새 링크를 만들어 주세요.'):'';
 }
 async function run(action){
  if(busy)return;
  if(action==='create'&&active&&!confirm('새 링크를 만들면 기존 가입 링크는 사용할 수 없게 됩니다. 새로 만드시겠습니까?'))return;
  if(action==='revoke'&&!confirm('이 합창단 가입 링크를 취소하시겠습니까? 이미 가입한 단원은 유지됩니다.'))return;
  if(action==='create'&&!known){notice.textContent='기존 링크를 먼저 확인해야 합니다. 링크 다시 불러오기를 눌러 주세요.';return;}
  busy=true;host.querySelectorAll('button').forEach(x=>x.disabled=true);notice.textContent='처리 중입니다…';
  try{
   if(action==='copy'){await navigator.clipboard.writeText(link);notice.textContent='복사했습니다. 카카오톡이나 문자로 보내 주세요.';}
   else if(action==='create'){const r=await request(action);show({...r,active:true,state:'active',uses:0});notice.textContent='가입 링크를 만들었습니다.';}
   else if(action==='revoke'){await request(action);show({state:'revoked',active:false,token:link?new URLSearchParams(new URL(link).hash.slice(1)).get('invite'):null});notice.textContent='이 합창단의 가입 링크를 취소했습니다. 이미 가입한 단원은 유지됩니다.';}
   else show(await request('status'));
  }catch(err){notice.textContent=err.message;}finally{busy=false;host.querySelectorAll('button').forEach(x=>x.disabled=false);}
 }
 host.addEventListener('click',e=>{const b=e.target.closest('[data-invite-action]');if(!b)return;e.stopPropagation();run(b.dataset.inviteAction);});
 run('status');
}
