import { config } from "./config.js";
import { PortalDemo } from "./portal-demo.js";
const $ = (s) => document.querySelector(s), root = $("#portal"), dialog = $("#dialog"), mode = document.body.dataset.portal;
const params = new URLSearchParams(location.search), fragment = new URLSearchParams(location.hash.slice(1));
const base = (config.apiBase || (location.pathname.startsWith("/portal/") ? location.origin : "")).replace(/\/$/, "");
const isDemo = params.get("demo") === "1" || !base, demo = new PortalDemo();
const state = { w: null, invite: null, list: [], screen: null, error: "", me: null };
if (params.has("error") && sessionStorage.getItem("choiron-pending-invite")) fragment.set("invite", sessionStorage.getItem("choiron-pending-invite"));
const names = { invited: "초대됨", configuring: "설정 중", active: "사용 중", cancelled: "초대 취소", suspended: "사용 중지" };
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const field = (label, name, value = "", type = "text", extra = "") => `<label class="field">${label}<input name="${name}" value="${esc(value)}" type="${type}" ${extra}></label>`;
const button = (label, action, extra = "", kind = "") => `<button class="btn ${kind}" data-action="${action}" ${extra}>${label}</button>`;
async function request(path, p) {
  if (isDemo) return demo.request(path, p);
  const r = await fetch(base + path, { method: p === void 0 ? "GET" : "POST", credentials: "same-origin", headers: p === void 0 ? {} : { "Content-Type": "application/json" }, body: p === void 0 ? void 0 : JSON.stringify(p), signal: AbortSignal.timeout(12e4) });
  const data = await r.json();
  if (!data.ok) throw Object.assign(Error(data.error), { status: r.status });
  return data.data;
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
function header() {
  return `${isDemo ? '<div class="portal-banner">기능 체험 · 실제 초대 발송이나 Google 연결은 하지 않습니다. 이 브라우저에서만 저장됩니다.</div>' : ""}<header class="portal-header"><a class="brand" href="./index.html"><img src="./assets/icon.svg" alt=""><span>Choir<b>ON</b></span></a><span class="portal-tag">${mode === "operator" ? "SERVICE CONSOLE" : "WELCOME TO YOUR WORKSPACE"}</span>${mode === "operator" ? `<a class="btn secondary small" href="./index.html">앱 보기 ↗</a>` : button("나중에 계속", "later", "", "secondary small")}</header>`;
}
function render() {
  root.innerHTML = header() + `<main class="portal-body">${state.error ? `<div class="portal-message" role="alert">${esc(state.error)}${state.w?.connectionError ? '<div class="toolbar">' + button("Google 다시 연결", "reconnect", "", "secondary") + "</div>" : ""}</div>` : ""}${mode === "operator" ? operator() : wizard()}</main><footer class="portal-footer">함께하는 찬양, 더 가까운 연결. Powered by ChoirON</footer>`;
}
function operator() {
  if (!state.me) return `<section class="card portal-login"><div class="wizard-icon">♧</div><div class="portal-kicker">SERVICE CONSOLE</div><h1>우리의 연결을 시작해요.</h1><p class="sub">Workspace 관리자를 초대하고<br>설정 진행 상황을 한눈에 확인하세요.</p>${button('<span class="google-mark">G</span>운영자 Google 로그인', "operator-login", "", "google-btn")}<p class="muted">등록된 서비스 운영자 계정만 사용할 수 있습니다.</p></section>`;
  const list = state.list;
  return `<div class="portal-top"><div><div class="portal-kicker">WORKSPACE INVITATIONS</div><h1>새로운 찬양대를 초대하세요.</h1><p class="sub">링크 하나로 시작하고, 각자의 공간에서 함께합니다.</p></div>${button("+ 관리자 초대", "invite")}</div><div class="portal-stats">${[["invited", "초대를 기다리는 공간"], ["configuring", "설정하고 있는 공간"], ["active", "함께하고 있는 공간"]].map(([s, n]) => `<div class="portal-stat"><span>${n}</span><strong>${list.filter((w) => w.status === s).length}<small style="font-size:13px;font-weight:500;color:var(--muted)"> 개</small></strong></div>`).join("")}</div><section class="card"><div class="card-head"><h2>내 Workspace</h2>${button("새로고침", "refresh", "", "small secondary")}</div>${list.length ? `<div class="table-wrap"><table class="portal-table"><thead><tr><th>Workspace / 관리자</th><th>진행 상태</th><th>연결</th><th>관리</th></tr></thead><tbody>${list.map((w) => `<tr><td><strong>${esc(w.name)}</strong><span class="muted">${esc(w.code)} · ${esc(w.email)}</span></td><td><span class="portal-pill ${w.status}">${names[w.status]}</span>${w.status === "configuring" ? `<span class="muted">${w.step}/6 단계 완료</span>` : ""}</td><td><span class="muted">${w.connectionError ? "재연결 필요" : w.connected ? "Google 연결됨" : "연결 대기"}</span></td><td><div class="portal-actions">${!w.connected ? button("초대 재발급", "reissue", `data-id="${w.id}"`, "small secondary") + button("초대 취소", "cancel", `data-id="${w.id}"`, "small secondary") : button(w.status === "suspended" ? "사용 재개" : "사용 중지", w.status === "suspended" ? "resume" : "suspend", `data-id="${w.id}"`, "small secondary")}</div></td></tr>`).join("")}</tbody></table></div>` : '<div class="portal-empty"><div class="wizard-icon">↗</div><h2>첫 Workspace를 초대해 보세요.</h2><p class="muted">관리자 이메일과 Workspace 이름만 있으면 됩니다.</p>' + button("첫 관리자 초대", "invite") + "</div>"}</section><div class="portal-note">각 관리자는 자신의 Google Drive에 회원·출결·사진을 보관합니다. 이 화면에서는 초대와 설정 상태만 관리합니다.</div><p class="muted">${esc(state.me.email)} · ${button("로그아웃", "logout", "", "small secondary")}</p>`;
}
function screen() {
  if (state.screen !== null) return state.screen;
  if (!state.w) return 0;
  return state.w.step;
}
function sidebar(s) {
  return `<aside class="wizard-side"><div class="eyebrow">A NEW BEGINNING</div><h2>${esc(state.w?.name || state.invite?.name || "우리의 새 공간")}</h2><p>처음이라도 괜찮아요.<br>하나씩 함께 준비해 보겠습니다.</p><div class="wizard-steps">${["Google 연결", "저장 공간 준비", "관리자 정보", "찬양대·단원", "장소·일정", "시작하기"].map((n, i) => `<div class="wizard-step ${s === i ? "current" : s > i ? "complete" : ""}"><b>${s > i ? "✓" : i + 1}</b>${n}</div>`).join("")}</div><p>완료한 단계는 자동 저장됩니다.<br>언제든 다시 이어서 시작하세요.</p></aside>`;
}
function form(action, html, label = "저장하고 다음") {
  return `<form data-form="${action}">${html}<p class="error" id="formError" role="alert"></p><div class="wizard-foot">${screen() > 1 ? button("← 이전", "back", "", "secondary") : '<span class="wizard-progress">차근차근 준비하고 있어요.</span>'}<button type="submit" class="btn">${label} →</button></div></form>`;
}
function wizard() {
  const s = screen();
  if (s === 6 && state.w) return complete();
  let content = "";
  if (s === 0) {
    content = `<div class="wizard-icon">♪</div><div class="portal-kicker">YOU ARE INVITED</div><h1>${state.invite ? "관리자로 초대받으셨습니다." : "Workspace 설정을 이어가세요."}</h1><p class="sub">${state.invite ? `<strong>${esc(state.invite.name)}</strong>의 새로운 시작을 함께해 주세요.<br>초대받은 Google 계정 <strong>${esc(state.invite.email)}</strong>으로 연결하시면 됩니다.` : "초대 링크가 있으시면 그 링크를 열어 주세요.<br>이미 Google 연결을 마쳤다면 Workspace 코드로 다시 로그인할 수 있습니다."}</p><ul class="wizard-bullets"><li>내 Google Drive에 필요한 공간을 자동으로 만듭니다.</li><li>별도 프로그램 설치나 코드 복사가 필요 없습니다.</li><li>설정은 중간에 멈췄다가 이어서 할 수 있습니다.</li></ul>${state.invite ? button('<span class="google-mark">G</span> 초대를 수락하고 Google 연결', "google", "", "google-btn") : form("resume", field("Workspace 코드", "code", fragment.get("workspace") || "", "text", "required"), "Google로 이어서 설정")}<p class="muted">Google 연결 권한은 본인이 직접 승인합니다. 앱이 만든 Drive 파일에 대한 권한만 요청합니다.</p>`;
  }
  if (s === 1) content = `<div class="wizard-icon">✓</div><div class="portal-kicker">GOOGLE CONNECTED</div><h1>Google 연결이 완료되었습니다.</h1><p class="sub">이제 회원·출결을 안전하게 보관할<br>전용 폴더와 Sheet를 준비할게요.</p><div class="check-row"><span>연결한 계정</span><span>${esc(state.me?.email || state.w.email)}</span></div><ul class="wizard-bullets"><li>회원·로그인 Sheet</li><li>프로필 사진 폴더</li><li>자동 백업 폴더</li></ul><div class="wizard-foot"><span class="muted">내 Drive에 생성됩니다.</span>${button("내 저장 공간 준비하기 →", "prepare")}</div>`;
  if (s === 2) content = `<div class="portal-kicker">YOUR ACCOUNT</div><h1>관리자 정보를 알려주세요.</h1><p class="sub">단원 앱에서 사용할 이름과 로그인 정보를 정합니다.</p>${state.w?.adminId ? `<div class="hint">관리자 ID <b>${esc(state.w.adminId)}</b>가 이미 등록되어 있습니다. PIN은 안전하게 저장되어 다시 표시하지 않습니다.</div>${button("다음 단계로 →", "next")}` : form("account", `${field("관리자 이름", "name", "", "text", 'required maxlength="80" autocomplete="name"')}${field("로그인 ID", "id", "", "text", 'required pattern="[A-Za-z0-9_-]{1,64}" autocomplete="username" placeholder="예: choiradmin"')}${field("PIN", "pin", "", "password", 'required pattern="[0-9]{6,12}" inputmode="numeric" autocomplete="new-password"')}${field("PIN 확인", "confirm", "", "password", 'required inputmode="numeric" autocomplete="new-password"')}<p class="field-help">숫자 6~12자리로 정해 주세요. PIN 원문은 저장하지 않습니다.</p>`)}`;
  if (s === 3) content = `<div class="portal-kicker">OUR CHOIR</div><h1>첫 찬양대를 만들어 볼까요?</h1><p class="sub">찬양대별 출결 Sheet는 자동으로 생성합니다.<br>여러 찬양대는 설정을 마친 뒤 더 추가할 수 있습니다.</p>${form("choir", `${field("찬양대 이름", "name", "", "text", 'required maxlength="80" placeholder="예: 예루살렘 찬양대"')}${field("관리자 본인의 파트", "part", "지휘", "text", "required")}<p class="muted">관리자 본인은 첫 단원으로 자동 등록됩니다.</p>`)}`;
  if (s === 4) content = `<div class="portal-kicker">FIRST REHEARSAL</div><h1>첫 연습을 준비해 주세요.</h1><p class="sub">단원은 지정한 장소와 시간 안에서 출석할 수 있습니다.</p><div class="toolbar">${button("+ 단원 한 명 등록", "member", "", "soft")}<span class="muted">일괄등록은 시작 후 단원 메뉴에서 가능합니다.</span></div>${form("schedule", `<div class="form-grid">${field("연습 이름", "title", "첫 찬양 연습", "text", "required")}${field("장소 이름", "placeName", "찬양대실", "text", "required")}<div class="full">${button("⌖ 지금 있는 위치로 설정", "locate", "", "secondary")}<p class="muted">출석할 장소에 계실 때 눌러 주세요. 직접 좌표를 입력해도 됩니다.</p></div>${field("장소 위도", "lat", "", "number", 'required min="-90" max="90" step="any"')}${field("장소 경도", "lng", "", "number", 'required min="-180" max="180" step="any"')}${field("출석 허용 반경 (m)", "radius", "150", "number", 'required min="10" max="3000"')}${field("연습 시작", "start", date(19), "datetime-local", "required")}${field("연습 종료", "end", date(21), "datetime-local", "required")}${field("출석 허용 시작", "open", date(18), "datetime-local", "required")}${field("출석 마감", "close", date(21), "datetime-local", "required")}</div><p class="muted">일정은 이 기기의 시간대로 입력합니다. 단원 좌표는 저장하지 않습니다.</p>`)}`;
  if (s === 5) content = `<div class="wizard-icon">✓</div><div class="portal-kicker">READY TO SING</div><h1>이제 시작할 준비가 됐습니다.</h1><p class="sub">아래 항목이 모두 준비되었습니다.<br>시작하기를 누르면 단원용 링크가 만들어집니다.</p>${["Google 연결", "회원·로그인 저장 공간", "관리자 계정", "첫 찬양대", "출석 장소와 연습 일정"].map((n) => `<div class="check-row"><span>${n}</span><span>✓ 완료</span></div>`).join("")}<div class="wizard-foot">${button("← 이전", "back", "", "secondary")}${button("ChoirON 시작하기 →", "finish")}</div>`;
  return `<div class="portal-layout">${sidebar(s)}<section class="card wizard-card">${content}</section></div>`;
}
function complete() {
  return `<section class="card wizard-card success-panel" style="max-width:740px;margin:auto"><div class="success-mark">✓</div><div class="portal-kicker">WELCOME ABOARD</div><h1>${esc(state.w.name)}, 시작되었습니다.</h1><p class="sub">아래 링크나 QR코드를 단원에게 전달해 주세요.<br>단원은 본인의 ID와 초기 PIN으로 로그인하면 됩니다.</p><div class="link-box" id="memberLink">${esc(state.w.memberUrl)}</div><div class="toolbar" style="justify-content:center">${button("단원 링크 복사", "copy-member", "", "secondary")}${button("QR코드 보기", "member-qr", "", "secondary")}${button("앱 열기 →", "open-app")}</div><div class="portal-note">다음에는 단원 일괄등록, 찬양대 추가, 로고와 테마를 설정해 보세요.</div></section>`;
}
function date(h) {
  const d = /* @__PURE__ */ new Date();
  d.setHours(h, 0, 0, 0);
  return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
}
function modal(title, html, submit) {
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialogTitle">${title}</h2><button class="close" data-action="close" aria-label="닫기">×</button></div>${submit ? '<form data-form="modal">' : ""}${html}${submit ? '<p class="error" id="modalError" role="alert"></p><div class="actions"><button class="btn" type="submit">저장</button></div></form>' : ""}`;
  if (!dialog.open) dialog.showModal();
  modal.submit = submit;
}
async function linkDialog(url) {
  modal("초대 링크가 준비되었습니다.", `<p class="muted">링크를 복사해 카톡이나 이메일로 전달해 주세요.<br>자동으로 메시지를 보내지는 않습니다. 초대 유효기간은 7일입니다.</p><div class="link-box" id="inviteLink">${esc(url)}</div><div class="toolbar">${button("링크 복사", "copy-link", "", "")}<a class="btn secondary" href="${esc(url)}" target="_blank" rel="noopener">설정 화면 열기 ↗</a></div><div class="qr-wrap"><canvas id="qr" aria-label="초대 링크 QR코드"></canvas></div>`);
  await QRCode.toCanvas($("#qr"), url, { width: 210, margin: 2, errorCorrectionLevel: "M" });
}
async function reload() {
  state.error = "";
  try {
    state.me = await request("/api/me");
    if (mode === "operator") {
      if (!state.me.isOperator && state.me.role !== "operator") throw Error("서비스 운영자 Google 계정으로 로그인해 주세요.");
      state.list = await request("/api/operator/workspaces");
    } else {
      state.w = await request("/api/onboarding/status");
      if (state.invite && state.w.code !== state.invite.code) {
        state.w = null;
        state.me = null;
      }
      state.error = state.w?.connectionError || "";
      state.screen = null;
    }
  } catch (e) {
    if (e.status !== 401 && !isDemo) state.error = e.message;
    state.me = null;
  }
  render();
  restoreDraft();
}
function draftKey() {
  return "choiron-setup-draft:" + state.w?.id + ":" + screen();
}
function saveDraft() {
  const form2 = $("form[data-form=schedule]") || $("form[data-form=choir]");
  if (!form2 || !state.w) return;
  const values = Object.fromEntries(new FormData(form2));
  for (const k of ["pin", "confirm"]) delete values[k];
  sessionStorage.setItem(draftKey(), JSON.stringify(values));
}
function restoreDraft() {
  if (!state.w) return;
  try {
    const values = JSON.parse(sessionStorage.getItem(draftKey()) || "{}");
    for (const [k, v] of Object.entries(values)) {
      const input = document.querySelector(`form [name="${k}"]`);
      if (input && input.type !== "password") input.value = v;
    }
  } catch {
  }
}
const actions = {
  refresh: reload,
  close: () => dialog.close(),
  invite: () => modal("새 Workspace 관리자 초대", `${field("Workspace 이름", "name", "", "text", 'required maxlength="80" placeholder="예: 신광교회"')}${field("Workspace 코드", "code", "", "text", 'required pattern="[A-Za-z0-9_-]{2,32}" placeholder="예: SKC"')}${field("관리자 Google 이메일", "email", "", "email", 'required placeholder="name@gmail.com"')}<p class="muted">초대받은 이메일과 같은 Google 계정으로만 설정할 수 있습니다.</p>`, async (p) => {
    const r = await request("/api/operator/invite", p);
    await reload();
    await linkDialog(r.url);
  }),
  reissue: async (el) => {
    if (!confirm("기존 초대 링크를 취소하고 새 링크를 발급할까요?")) return;
    const r = await request("/api/operator/action", { id: el.dataset.id, action: "reissue" });
    await reload();
    await linkDialog(r.url);
  },
  cancel: async (el) => {
    if (!confirm("이 초대를 취소할까요?")) return;
    await request("/api/operator/action", { id: el.dataset.id, action: "cancel" });
    await reload();
  },
  suspend: async (el) => {
    if (!confirm("이 Workspace의 앱 사용을 중지할까요? 기존 출결 파일은 유지됩니다.")) return;
    await request("/api/operator/action", { id: el.dataset.id, action: "suspend" });
    await reload();
  },
  resume: async (el) => {
    await request("/api/operator/action", { id: el.dataset.id, action: "resume" });
    await reload();
  },
  "copy-link": async () => {
    await navigator.clipboard.writeText($("#inviteLink").textContent);
    toast("초대 링크를 복사했습니다.");
  },
  "operator-login": async () => {
    const r = await request("/api/oauth/start", { mode: "operator" });
    location.href = r.url;
  },
  google: async () => {
    sessionStorage.setItem("choiron-pending-invite", fragment.get("invite") || "");
    const r = await request("/api/oauth/start", { mode: "owner", token: fragment.get("invite") });
    location.href = r.url;
  },
  reconnect: async () => {
    const r = await request("/api/oauth/start", { mode: "owner", code: state.w.code });
    location.href = r.url;
  },
  prepare: async () => {
    await request("/api/onboarding/prepare", {});
    await reload();
  },
  back: () => {
    saveDraft();
    state.screen = Math.max(1, screen() - 1);
    render();
    restoreDraft();
  },
  next: () => {
    state.screen = Math.min(state.w.step, screen() + 1);
    render();
    restoreDraft();
  },
  later: () => {
    saveDraft();
    modal("진행 내용이 저장되었습니다.", `<p>완료한 단계는 서버에 저장되어 있습니다. 이 창을 닫으셔도 됩니다.</p><p class="muted">다시 초대 링크를 열거나, Workspace 코드 <b>${esc(state.w?.code || state.invite?.code || "")}</b>로 Google 로그인하면 이어서 설정할 수 있습니다.</p>${isDemo ? '<p class="muted">체험 모드는 이 브라우저에서만 이어갈 수 있습니다.</p>' : ""}`);
  },
  member: () => modal("첫 단원 등록", `${field("이름", "name", "", "text", "required")}${field("단원 ID", "id", "", "text", 'required pattern="[A-Za-z0-9_-]{1,64}"')}${field("파트", "part", "소프라노", "text", "required")}${field("초기 PIN", "pin", "", "password", 'required pattern="[0-9]{6,12}" inputmode="numeric"')}<p class="muted">첫 로그인 때 본인이 PIN을 변경합니다.</p>`, async (p) => {
    await request("/api/onboarding/member", p);
    dialog.close();
    toast("단원을 등록했습니다.");
  }),
  locate: async () => {
    const p = isDemo ? { coords: { latitude: 37.5665, longitude: 126.978 } } : await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => reject(Error("위치 권한을 허용해 주세요.")), { enableHighAccuracy: true, timeout: 15e3, maximumAge: 0 }));
    $("[name=lat]").value = p.coords.latitude;
    $("[name=lng]").value = p.coords.longitude;
    saveDraft();
    if (isDemo) toast("체험용 장소 좌표를 채웠습니다.");
  },
  finish: async () => {
    await request("/api/onboarding/finish", {});
    await reload();
  },
  "copy-member": async () => {
    await navigator.clipboard.writeText(state.w.memberUrl);
    toast("단원 링크를 복사했습니다.");
  },
  "member-qr": async () => {
    modal("단원 접속 QR코드", '<div class="qr-wrap"><canvas id="qr" aria-label="단원 접속 QR코드"></canvas></div>');
    await QRCode.toCanvas($("#qr"), state.w.memberUrl, { width: 230, margin: 2 });
  },
  "open-app": async () => {
    if (isDemo) {
      location.href = "./index.html";
      return;
    }
    const login = await request("/api/onboarding/login", {});
    const url = new URL(state.w.frontend);
    url.hash = new URLSearchParams({ workspace: state.w.code, token: login.token }).toString();
    location.href = url.href;
  },
  logout: async () => {
    await request("/api/logout", {});
    state.me = null;
    state.w = null;
    render();
  }
};
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  e.preventDefault();
  const action = actions[el.dataset.action];
  if (!action) return;
  el.disabled = true;
  try {
    await action(el);
  } catch (err) {
    state.error = err.message;
    toast(err.message);
  } finally {
    el.disabled = false;
  }
});
document.addEventListener("input", saveDraft);
document.addEventListener("submit", async (e) => {
  const form2 = e.target.closest("[data-form]");
  if (!form2) return;
  e.preventDefault();
  const p = Object.fromEntries(new FormData(form2)), submit = form2.querySelector("[type=submit]"), error = form2.querySelector(".error"), kind = form2.dataset.form;
  submit.disabled = true;
  if (error) error.textContent = "";
  try {
    if (kind === "modal") {
      await modal.submit(p);
      return;
    }
    if (kind === "resume") {
      const r = await request("/api/oauth/start", { mode: "owner", code: p.code });
      location.href = r.url;
      return;
    }
    if (kind === "account" && p.pin !== p.confirm) throw Error("PIN이 서로 다릅니다.");
    if (kind === "schedule") {
      for (const k of ["start", "end", "open", "close"]) p[k] = new Date(p[k]).toISOString();
      for (const k of ["lat", "lng", "radius"]) p[k] = Number(p[k]);
      if (Date.parse(p.start) >= Date.parse(p.end) || Date.parse(p.open) > Date.parse(p.close)) throw Error("시작·종료 시간을 확인해 주세요.");
    }
    await request("/api/onboarding/" + kind, p);
    await reload();
  } catch (err) {
    if (error) error.textContent = err.message;
    else toast(err.message);
  } finally {
    submit.disabled = false;
  }
});
async function init() {
  if (mode === "start" && fragment.has("invite")) {
    try {
      state.invite = await request("/api/invitations/inspect", { token: fragment.get("invite") });
      if (isDemo && state.invite.step === 0) {
        render();
        return;
      }
    } catch (e) {
      state.error = e.message;
      render();
      return;
    }
  }
  await reload();
  if (state.w?.connected) sessionStorage.removeItem("choiron-pending-invite");
  if (params.has("error")) {
    state.error = params.get("error");
    render();
  }
}
if (!isDemo && location.origin !== new URL(base).origin) {
  location.replace(base + "/portal/" + (mode === "operator" ? "operator.html" : "start.html") + location.search + location.hash);
} else init();
