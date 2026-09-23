const role=location.pathname.endsWith('/operator.html')?'admin':'member';
const base=new URL('./',import.meta.url),cacheName='choiron-install-artwork-v1';
let pendingPrompt=null,sequence=0;
const note=()=>document.querySelector('#install-note');
const safeLogo=v=>typeof v==='string'&&v.length<=140000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v)?v:null;
const registration='serviceWorker' in navigator?navigator.serviceWorker.register(new URL('sw-install.js',base),{scope:base.pathname}).then(async r=>{if(!r.active)await new Promise((resolve,reject)=>{const worker=r.installing||r.waiting;const timer=setTimeout(()=>reject(Error('설치 준비가 늦어지고 있습니다. 새로고침해 주세요.')),8000);worker?.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}});});return r;}):Promise.reject(Error('이 브라우저에서는 기본 아이콘으로 홈 화면에 추가해 주세요.'));
registration.catch(()=>{});
function metadata(version='default') {const page=role==='admin'?'operator':'member',label=role==='admin'?'관리자':'단원';return {id:new URL(page+'.html',base).href,name:'ChoirON '+label,short_name:'ChoirON '+label,lang:'ko',start_url:new URL(page+'.html',base).href,scope:base.href,display:'standalone',background_color:'#f5f7fb',theme_color:role==='admin'?'#7551c8':'#255bdd',icons:[192,512].map(size=>({src:new URL(`assets/app-${role}-${size}.png?v=${version}`,base).href,sizes:`${size}x${size}`,type:'image/png',purpose:'any'}))};}
function refreshLinks(version){for(const rel of ['icon','apple-touch-icon']){const el=document.querySelector(`link[rel="${rel}"]`);if(el)el.href=new URL(`assets/app-${role}-192.png?v=${version}`,base).href;}const manifest=document.querySelector('link[rel=manifest]');if(manifest)manifest.href=new URL(`manifest-${role}.webmanifest?v=${version}`,base).href;}
export async function setAppIcon(logo){
 const request=++sequence,value=safeLogo(logo);await registration;
 const source=value||new URL(role==='admin'?'assets/icon-admin.svg':'assets/icon.svg',base).href;
 const image=new Image();image.src=source;await image.decode();
 const version=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16);
 const entries=[];
 for(const size of [192,512]){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.fillStyle=value?'#ffffff':role==='admin'?'#7551c8':'#255bdd';ctx.fillRect(0,0,size,size);const scale=Math.min(size/image.naturalWidth,size/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;ctx.drawImage(image,(size-w)/2,(size-h)/2,w,h);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));entries.push([new URL(`assets/app-${role}-${size}.png`,base).href,new Response(blob,{headers:{'Content-Type':'image/png'}})]);}
 if(request!==sequence)return;
 const cache=await caches.open(cacheName);for(const [url,response] of entries)await cache.put(url,response);
 await cache.put(new URL(`manifest-${role}.webmanifest`,base).href,new Response(JSON.stringify(metadata(version)),{headers:{'Content-Type':'application/manifest+json'}}));refreshLinks(version);
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();pendingPrompt=e;});
window.addEventListener('appinstalled',()=>{pendingPrompt=null;if(note())note().textContent='홈 화면에 앱을 추가했습니다.';});
const install=document.querySelector('#install-app');
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(install)install.addEventListener('click',async()=>{
 if(pendingPrompt&&!standalone()){const prompt=pendingPrompt;pendingPrompt=null;await prompt.prompt();await prompt.userChoice;return;}
 const target=note();if(!target)return;target.replaceChildren();
 const url=new URL(role==='admin'?'operator.html':'member.html',base);
 const workspace=new URL(location.href).searchParams.get('workspace');
 if(role==='member'&&/^[a-f0-9-]{36}$/i.test(workspace||''))url.searchParams.set('workspace',workspace);
 const help=document.createElement('p');help.textContent=standalone()?'설치된 앱에서는 아래 주소를 복사해 Safari나 Chrome 주소창에 붙여 넣어 주세요.':'웹페이지를 연 뒤 브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해 주세요.';
 const input=document.createElement('input');input.readOnly=true;input.value=url.href;input.setAttribute('aria-label','웹페이지 주소');input.style.width='100%';input.addEventListener('click',()=>input.select());
 const toolbar=document.createElement('div');toolbar.className='toolbar';
 const copy=document.createElement('button');copy.type='button';copy.className='btn secondary';copy.textContent='주소 복사';
 const status=document.createElement('span');status.setAttribute('role','status');
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(url.href);status.textContent='주소를 복사했습니다. 브라우저 주소창에 붙여 넣어 주세요.';}catch{input.focus();input.select();status.textContent='주소를 길게 눌러 복사해 주세요.';}});
 const open=document.createElement('a');open.href=url.href;open.target='_blank';open.rel='noopener noreferrer';open.className='btn secondary';open.textContent='웹페이지 열기';
 const tip=document.createElement('p');tip.textContent='웹페이지 열기가 앱 안에서 열리면 주소 복사를 이용해 주세요. iPhone에서는 Safari의 공유 → 홈 화면에 추가를 선택합니다.';
 toolbar.append(copy,open);target.append(help,input,toolbar,status,tip);
});
registration.then(async()=>{const cached=await (await caches.open(cacheName)).match(new URL(`manifest-${role}.webmanifest`,base).href);if(cached){const m=await cached.json();refreshLinks(new URL(m.icons[0].src).searchParams.get('v')||'saved');}}).catch(e=>{if(note())note().textContent=e.message;});
