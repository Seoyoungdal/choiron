export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const date=s=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
export const field=(name,label,type='text',extra='')=>`<label class="field">${label}<input name="${name}" type="${type}" ${extra} required></label>`;
export function position(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('이 기기에서는 위치 확인을 지원하지 않습니다.'));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>reject(Error('위치를 확인하지 못했습니다. 브라우저 위치 권한을 허용하고 다시 시도해 주세요.')),{enableHighAccuracy:true,timeout:15000,maximumAge:0});});}
