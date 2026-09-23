import {appearance} from './appearance.js';
import {applyTheme} from './themes.js';
import {manage} from './manage.js';
import {supabaseConfig as config} from './supabase-config.js';
const screen=document.querySelector('#screen'),message=document.querySelector('#message');
let accessToken='',busy=false,requestId='',myWorkspaces=[],isOperator=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(path,body,token=accessToken) {
 const headers={'apikey':config.publishableKey,'Content-Type':'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetch(config.url+path,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const raw=await response.text();let result;try{result=raw?JSON.parse(raw):null;}catch{throw Error('서버 응답을 확인할 수 없습니다.');}
 if(!response.ok){
  if(result?.code==='PGRST202')throw Error('추가 설정 006_invites_themes.sql을 먼저 적용해 주세요.');
  if(response.status===401)throw Error('이메일·비밀번호를 확인해 주세요. 로그인 시간이 만료됐다면 새로고침 후 다시 로그인해 주세요.');
  throw Error(result?.message||'요청을 처리하지 못했습니다.');
 }
 return result;
}
function login(){accessToken='';screen.innerHTML=`<section class="card"><form id="login"><label class="field">관리자 이메일<input name="email" type="email" autocomplete="username" placeholder="이메일 주소" required></label><label class="field">관리자 비밀번호<input name="password" type="password" autocomplete="current-password" required></label><p class="muted">처음 설정하거나 초대 가입할 때 정한 이메일·비밀번호로 로그인하세요.</p><button class="btn" type="submit">로그인</button></form></section>`;}
async function overview(){
 screen.onclick=null;screen.onsubmit=null;screen.onchange=null;applyTheme();
 const portal=await request('/rest/v1/rpc/choiron_admin_portal',{});myWorkspaces=portal.mine;isOperator=portal.operator;const service=portal.service;
 screen.innerHTML=`<section class="card"><div class="row"><h2>${isOperator?'운영자 연결 완료':'내 Workspace'}</h2><button class="btn secondary" id="logout">로그아웃</button></div>${isOperator?`<p>Workspace ${service.workspaces.length}개 · 초대 ${service.invitations.length}개</p><div class="toolbar"><button class="btn" id="invite">Workspace 관리자 초대</button><button class="btn secondary" id="setup">내 Workspace 만들기</button></div>${service.workspaces.map(w=>`<p>${esc(w.name)} · ${esc(w.status==='active'?'운영 중':w.status)}</p>`).join('')}<details><summary>초대 내역</summary>${service.invitations.map(i=>`<p>${esc(i.workspace_name)} · ${esc(i.email)}<br>${i.accepted_at?'가입 완료':i.revoked_at?'취소됨':new Date(i.expires_at)<new Date()?'만료됨':'가입 대기'} ${!i.accepted_at&&!i.revoked_at&&new Date(i.expires_at)>new Date()?`<button class="btn secondary" data-revoke="${i.id}">초대 취소</button>`:''}</p>`).join('')||'<p>아직 초대가 없습니다.</p>'}</details>`:''}</section>${myWorkspaces.map(w=>`<section class="card"><h2>${esc(w.name)}</h2><p>관리자: ${esc(w.admin_name)} · 아이디: ${esc(w.login_id)}</p><p>찬양대: ${w.choirs.map(c=>esc(w.name+' · '+c.name)).join(', ')}</p><div class="toolbar"><button class="btn" data-manage="${esc(w.id)}">단원·일정 관리</button><button class="btn secondary" data-appearance="${esc(w.id)}">디자인 설정</button></div></section>`).join('')||(!isOperator?'<section class="card">연결된 Workspace가 없습니다. 운영자가 보내 준 초대 링크로 가입을 완료해 주세요.</section>':'')}`;
 message.textContent='계정과 권한을 확인했습니다.';
}
function invite(){screen.innerHTML=`<section class="card"><h2>Workspace 관리자 초대</h2><p>초대한 담당자에게 새 Workspace를 제공합니다.</p><form id="invite-form"><label class="field">교회·단체 이름<input name="name" maxlength="80" required></label><label class="field">담당자 이메일<input name="email" type="email" maxlength="254" required></label><p>초대는 7일 동안 유효합니다. 이메일은 자동 발송하지 않으며, 생성한 링크를 직접 전달합니다.</p><button class="btn">초대 링크 만들기</button></form><button class="btn secondary" id="back">돌아가기</button><div id="invite-result"></div></section>`;}
function setup(){
 requestId=crypto.randomUUID();message.textContent='';
 screen.innerHTML=`<section class="card"><h2>우리 Workspace 시작하기</h2><p>Google 설정이나 별도 파일 연결 없이 한 번에 만듭니다.</p><form id="create-workspace"><label class="field">교회·단체 이름<input name="workspace" placeholder="예: 신광교회" maxlength="80" required></label><label class="field">관리자 이름<input name="admin" placeholder="본인 이름" maxlength="80" required></label><label class="field">관리자 아이디<input name="loginId" placeholder="한글 이름도 가능합니다" maxlength="64" required></label><p class="muted">한글·영문·숫자·밑줄·붙임표를 띄어쓰기 없이 입력하세요. 지금은 기존 이메일·비밀번호로 로그인하며, PIN은 입력하지 않습니다.</p><label class="field">첫 찬양대 이름<input name="choir" placeholder="예: 예루살렘 찬양대" maxlength="80" required></label><div class="toolbar"><button class="btn" type="submit">Workspace 만들기</button><button class="btn secondary" type="button" id="back">돌아가기</button></div></form></section>`;
}
async function task(fn){if(busy)return;busy=true;screen.querySelectorAll('button').forEach(b=>b.disabled=true);message.textContent='처리 중입니다…';try{await fn();}catch(e){message.textContent=e.name==='TimeoutError'?'연결이 지연되고 있습니다. 같은 화면에서 다시 시도해 주세요.':e.message;}finally{busy=false;screen.querySelectorAll('button').forEach(b=>b.disabled=b.dataset.unavailable==='true');}}
 screen.addEventListener('submit',e=>{e.preventDefault();const form=new FormData(e.target);
 if(e.target.id==='invite-form')task(async()=>{const invitation=await request('/rest/v1/rpc/choiron_operator_invite',{p_name:form.get('name'),p_email:form.get('email')});const link=new URL('./join.html',location.href);link.hash='invite='+invitation.token;screen.querySelector('#invite-result').innerHTML=`<h3>초대 링크</h3><textarea id="invite-link" readonly aria-label="초대 링크">${esc(link.href)}</textarea><button class="btn secondary" id="copy-invite">링크 복사</button><p>${location.hostname==='127.0.0.1'||location.hostname==='localhost'?'현재는 이 PC에서만 열리는 시험 링크입니다. 외부 전달은 웹사이트 배포 후 생성해 주세요.':'초대한 담당자에게만 전달해 주세요.'}</p><p>링크는 이 화면에서만 확인할 수 있습니다. 분실하면 초대를 취소하고 다시 만들어 주세요.</p>`;message.textContent='초대를 만들었습니다.';});
 if(e.target.id==='login')task(async()=>{const session=await request('/auth/v1/token?grant_type=password',{email:form.get('email'),password:form.get('password')},'');accessToken=session.access_token;form.delete('password');e.target.elements.password.value='';await overview();});
 if(e.target.id==='create-workspace')task(async()=>{await request('/rest/v1/rpc/choiron_setup_workspace',{p_request_id:requestId,p_name:form.get('workspace'),p_admin_name:form.get('admin'),p_login_id:form.get('loginId'),p_choir_name:form.get('choir')});try{await overview();message.textContent='Workspace와 관리자, 첫 찬양대를 만들었습니다.';}catch{message.textContent='저장됐습니다. 목록을 불러오지 못했으니 돌아가기를 눌러 확인해 주세요.';}});
});
screen.addEventListener('click',e=>{if(busy)return;if(e.target.id==='invite'&&isOperator){invite();return;}if(e.target.id==='copy-invite'){task(async()=>{await navigator.clipboard.writeText(screen.querySelector('#invite-link').value);message.textContent='복사했습니다.';});return;}if(e.target.dataset.revoke){task(async()=>{await request('/rest/v1/rpc/choiron_operator_revoke',{p_id:e.target.dataset.revoke});await overview();message.textContent='초대를 취소했습니다.';});return;}if(e.target.dataset.appearance){const workspace=myWorkspaces.find(w=>w.id===e.target.dataset.appearance);if(workspace)appearance({root:screen,workspace,rpc:(name,args)=>request('/rest/v1/rpc/'+name,args),back:()=>task(overview)});return;}if(e.target.dataset.manage){const workspace=myWorkspaces.find(w=>w.id===e.target.dataset.manage);if(workspace){applyTheme(workspace.theme,workspace.logo);task(()=>manage({root:screen,workspace,rpc:(name,args)=>request('/rest/v1/rpc/'+name,args),back:()=>task(overview)}));}return;}if(e.target.id==='setup')setup();if(e.target.id==='back')task(overview);if(e.target.id==='logout')task(async()=>{const token=accessToken;login();try{await request('/auth/v1/logout',{},token);message.textContent='로그아웃했습니다.';}catch{message.textContent='이 화면에서는 로그아웃했습니다. 서버 로그아웃은 확인하지 못했습니다.';}});});
login();

