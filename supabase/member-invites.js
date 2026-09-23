import {esc} from './ui.js';
export function invitePanel({host,rpc,workspace,choir,label,session=null}){
 host.innerHTML=`<h2>단원 가입 링크</h2><p>${esc(label)}에 가입할 단원에게 링크를 복사해 보내 주세요. 이메일 인증 없이 가입합니다.</p><p>링크는 7일간 최대 500명이 사용할 수 있습니다. 새로 만들면 이전 링크는 취소됩니다.</p><div class="toolbar"><button type="button" class="btn" data-invite-action="create">가입 링크 만들기</button><button type="button" class="btn secondary" data-invite-action="revoke">가입 링크 취소</button></div><div data-invite-result></div><p role="status" data-invite-notice></p>`;
 let busy=false,link='';
 host.addEventListener('click',async e=>{
  const b=e.target.closest('[data-invite-action]');if(!b)return;e.stopPropagation();if(busy)return;
  busy=true;host.querySelectorAll('button').forEach(x=>x.disabled=true);const notice=host.querySelector('[data-invite-notice]');notice.textContent='처리 중입니다…';
  try{const action=b.dataset.inviteAction;
   if(action==='copy'){await navigator.clipboard.writeText(link);notice.textContent='복사했습니다. 카카오톡이나 문자로 보내 주세요.';}
   else{const r=await rpc('choiron_member_invite_manage',{p_workspace:workspace,p_choir:choir,p_action:action,p_session:session});
    if(action==='create'){const url=new URL('./member-join.html',location.href);url.hash='invite='+r.token;link=url.href;host.querySelector('[data-invite-result]').innerHTML=`<label class="field">가입 링크<input readonly aria-label="가입 링크" value="${esc(link)}"></label><button type="button" class="btn secondary" data-invite-action="copy">가입 링크 복사</button>`;notice.textContent='링크를 만들었습니다. 이 화면을 닫기 전에 복사해 두세요.';}
    else{link='';host.querySelector('[data-invite-result]').replaceChildren();notice.textContent='이 합창단의 가입 링크를 취소했습니다. 이미 가입한 단원은 유지됩니다.';}
   }
  }catch(err){notice.textContent=err.message;}finally{busy=false;host.querySelectorAll('button').forEach(x=>x.disabled=false);}
 });
}
