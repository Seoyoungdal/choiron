import {partField,bindParts} from './part-field.js?v=1';
import {supabaseConfig as config} from './supabase-config.js';
import {esc,field} from './ui.js';
const root=document.querySelector('#screen'),message=document.querySelector('#message');
bindParts(root);
let token=new URLSearchParams(location.hash.slice(1)).get('invite'),info=null,busy=false,mode='new';
history.replaceState(null,'',location.pathname+location.search);
async function rpc(name,args){const response=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});const r=await response.json();if(!response.ok||r.error)throw Error(r.code==='PGRST202'?'관리자가 단원 가입 설정(009)을 적용해야 합니다.':r.error||r.message||'요청을 처리하지 못했습니다.');return r;}
function entry(){root.innerHTML=`<h1>단원 회원가입</h1><p>합창단 관리자가 보내 주신 <strong>단원 가입 링크</strong>를 입력해 주세요. 해당 합창단으로만 가입됩니다.</p><form id="link">${field('link','받은 가입 링크','url')}<button class="btn">가입 화면 열기</button></form>`;}
function render(){root.innerHTML=`<p class="eyebrow">단원 회원가입</p><h1>${esc(info.workspace_name+' · '+info.choir_name)}</h1><div class="toolbar"><button type="button" class="btn ${mode==='new'?'':'secondary'}" data-mode="new">처음 가입하기</button><button type="button" class="btn ${mode==='existing'?'':'secondary'}" data-mode="existing">기존 계정으로 참여</button></div><p>${mode==='new'?'사용할 아이디와 PIN을 직접 정해 주세요. 한글 아이디도 가능합니다.':'같은 Workspace에 가입한 아이디와 PIN을 입력해 주세요. 기존 계정에 이 합창단을 추가합니다.'}</p><form id="enroll">${mode==='new'?field('name','이름','text','maxlength="80"'):''}${field('login_id','아이디 · 한글 가능','text','maxlength="64" pattern="[가-힣A-Za-z0-9_\\-]{1,64}" autocomplete="username"')}${field('pin','PIN · 숫자 6~12자리','password','inputmode="numeric" pattern="[0-9]{6,12}" maxlength="12" autocomplete="'+(mode==='new'?'new-password':'current-password')+'"')}${mode==='new'?field('confirm','PIN 다시 입력','password','inputmode="numeric" pattern="[0-9]{6,12}" maxlength="12" autocomplete="new-password"'):''}${partField()}<button class="btn">${mode==='new'?'가입하기':'이 합창단에 참여하기'}</button></form><p>이메일 인증은 필요하지 않습니다. 다른 Workspace에서는 각각 가입해 주세요.</p>`;}
async function run(fn){if(busy)return;busy=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);message.textContent='처리 중입니다…';try{await fn();}catch(e){message.textContent=e.name==='TimeoutError'?'응답이 늦어지고 있습니다. 기존 계정으로 참여를 선택해 가입 여부를 확인해 주세요.':e.message;}finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function preview(){info=await rpc('choiron_member_invite_preview',{p_token:token});render();message.textContent='';}
root.addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b&&!busy){mode=b.dataset.mode;render();message.textContent='';}});
root.addEventListener('submit',e=>{e.preventDefault();if(busy)return;const f=e.target,v=Object.fromEntries(new FormData(f));run(async()=>{
 if(f.id==='link'){const url=new URL(v.link);if(url.origin!==location.origin||!url.pathname.endsWith('/member-join.html'))throw Error('관리자가 보내 준 이 사이트의 단원 가입 링크를 입력해 주세요.');token=new URLSearchParams(url.hash.slice(1)).get('invite');await preview();return;}
 if(mode==='new'&&v.pin!==v.confirm)throw Error('두 PIN이 일치하지 않습니다.');
 let session=null;
 try{
  if(mode==='existing'){const r=await rpc('choiron_member_login',{p_workspace:info.workspace_id,p_login_id:v.login_id,p_pin:v.pin});session=r.token;}
  const r=await rpc('choiron_member_enroll',{p_token:token,p_name:v.name||'',p_login_id:v.login_id,p_pin:mode==='new'?v.pin:'',p_part:v.part,p_session:session});
  f.reset();const url=new URL('./member.html',location.href);url.searchParams.set('workspace',r.workspace_id);
  root.innerHTML=`<h1>${r.already_joined?'이미 가입한 합창단입니다':'가입이 완료되었습니다'}</h1><p>${esc(info.workspace_name+' · '+info.choir_name)}</p><p>아이디와 PIN으로 로그인해 주세요. 로그인한 합창단의 일정은 앱에서 함께 볼 수 있습니다.</p><a class="btn" href="${esc(url.href)}">단원 로그인</a>`;message.textContent='';
 }finally{delete v.pin;delete v.confirm;if(session)await rpc('choiron_member_action',{p_token:session,p_action:'logout',p_data:{}}).catch(()=>{});}
 });});
window.addEventListener('hashchange',()=>{const next=new URLSearchParams(location.hash.slice(1)).get('invite');if(next&&!busy){token=next;mode='new';history.replaceState(null,'',location.pathname+location.search);run(preview);}});
if(token)run(preview);else entry();
