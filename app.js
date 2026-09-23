import { Workspaces } from "./workspaces.js";
import { API, apiBase } from "./api.js";
import { config } from "./config.js";
import { ics, googleCalendar, download } from "./calendar.js";
import { reports } from "./reports.js";
import { exportExcel, importExcel } from "./excel.js";
let api = new API();
const workspaces = new Workspaces(localStorage);
let activeCode = "";
const C = globalThis.ChoirCore, $ = (s) => document.querySelector(s), app = $("#app"), dialog = $("#dialog");
const state = { page: "home", snapshot: null, data: {}, choir: "jer", month: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7), calendar: /* @__PURE__ */ new Date(), query: "", wizard: 0 };
const roleNames = { member: "단원", leader: "파트장", secretary: "서기", admin: "관리자" }, statusNames = { present: "출석", absent: "결석", excused: "인정결석", planned: "결석 예정", pending: "예정", cancelled: "취소" };
const themes = { blue: ["ChoirON Blue", "#255bdd"], forest: ["Forest", "#18785d"], lavender: ["Lavender", "#7551c8"], warm: ["Warm", "#b14d2c"], dark: ["Dark", "#243653"] };
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dayKey = (d) => {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmt = (s, opts) => new Date(s).toLocaleString("ko-KR", opts || { month: "long", day: "numeric", weekday: "short" });
const time = (s) => fmt(s, { hour: "2-digit", minute: "2-digit", hour12: false });
const uid = () => crypto.randomUUID().replaceAll("-", "");
const user = () => state.snapshot.user, db = () => state.snapshot, current = () => db().choirs.find((c) => c.id === state.choir), data = () => state.data[state.choir] || { sessions: [], places: [], attendance: [], reasons: [] };
const has = (roles) => C.has(db(), user(), state.choir, roles), admin = () => has(["admin"]);
const btn = (label, action, attrs = "", kind = "secondary") => `<button class="btn ${kind}" data-action="${action}" ${attrs}>${label}</button>`;
const field = (label, name, value = "", type = "text", extra = "") => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, options, value) => `<label class="field">${label}<select name="${name}">${options.map(([v, n]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`;
const badge = (status2) => `<span class="badge ${status2 === "present" ? "green" : status2 === "absent" ? "red" : "gray"}">${statusNames[status2] || esc(status2)}</span>`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 5500);
}
function status(s, id = user().id, d = data()) {
  if (s.status === "cancelled") return "cancelled";
  const a = d.attendance.find((a2) => a2.sessionId === s.id && a2.userId === id);
  if (a) return a.status;
  if (d.reasons.some((r) => r.sessionId === s.id && r.userId === id && !r.resolved)) return Date.now() > Date.parse(s.close) ? "absent" : "planned";
  return Date.now() > Date.parse(s.close) ? "absent" : "pending";
}
function title(kicker, title2, sub, actions2 = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title2}</h1><p class="sub">${sub}</p></div>${actions2}</div>`;
}
async function refresh() {
  state.snapshot = await api.request("snapshot");
  if (!db().choirs.some((c) => c.id === state.choir)) state.choir = db().choirs[0]?.id || "";
  state.data = {};
  if (!db().mustChange) {
    for (const c of db().choirs) state.data[c.id] = await api.request("choirData", { choirId: c.id });
  }
  render();
  if (db().mustChange) pinDialog(true);
}
async function mutate(action, p) {
  await api.request(action, { choirId: state.choir, ...p });
  await refresh();
}
function nav() {
  const items = [["home", "⌂", "홈"], ["calendar", "▦", "일정"], ["history", "◷", "내 출결"], ["profile", "♙", "내 정보"]];
  if (has(["leader", "secretary", "admin"])) items.push(["manage", "☷", "출결 관리"]);
  if (admin()) items.push(["members", "♧", "단원"], ["settings", "⚙", "설정"]);
  else if (user().workspaceAdmin) items.push(["settings", "⚙", "설정"]);
  return items.map(([id, icon, label]) => `<button data-page="${id}" class="${state.page === id ? "active" : ""}" aria-current="${state.page === id ? "page" : "false"}"><span class="ico" aria-hidden="true">${icon}</span>${label}</button>`).join("");
}
function render() {
  if (!db()) return;
  document.documentElement.dataset.theme = db().workspace.theme;
  const brand = `<img src="./assets/icon.svg" alt=""><span>Choir<b>ON</b></span>`;
  app.innerHTML = `<div class="demo-bar">${api.isDemo ? "체험 모드 · 가상 데이터로 자유롭게 둘러보세요." : "함께하는 찬양, 더 가까운 연결."}<button data-action="connect">${api.isDemo ? "내 Workspace 연결" : "Workspace 전환"}</button></div><aside class="sidebar"><div class="brand">${brand}</div><div class="workspace"><p>MY WORKSPACE</p><strong>${db().workspace.logo ? `<img src="${esc(db().workspace.logo)}" alt="Workspace 로고"> ` : ""}${esc(db().workspace.name)}</strong><select id="choirSelect" aria-label="찬양대 선택">${db().choirs.map((c) => `<option value="${esc(c.id)}" ${c.id === state.choir ? "selected" : ""}>${esc(c.name)}${c.status === "archived" ? " (보관)" : ""}</option>`).join("")}</select></div><nav aria-label="주 메뉴">${nav()}</nav><div class="side-bottom">${api.isDemo ? `체험할 역할<select id="persona" aria-label="데모 역할"><option value="kim" ${user().id === "kim" ? "selected" : ""}>김은혜 · 단원</option><option value="lee" ${user().id === "lee" ? "selected" : ""}>이영준 · 테너 파트장</option><option value="park" ${user().id === "park" ? "selected" : ""}>박서연 · 서기 + 파트장</option><option value="admin" ${user().id === "admin" ? "selected" : ""}>정하늘 · Workspace 관리자</option></select>` : "데이터는 Workspace에서 관리합니다."}<p><a href="./operator.html">Workspace 초대 관리 ↗</a></p><p>Powered by ChoirON · v2.0</p></div></aside><div class="layout"><header class="topbar"><span class="crumb">${esc(db().workspace.name)} <span aria-hidden="true">/</span> ${esc(current()?.name || "시작하기")}</span><div class="brand mobile-brand">${brand}</div><div class="profile-chip"><span class="online">● ${api.isDemo ? "DEMO" : navigator.onLine ? "연결됨" : "오프라인"}</span><span class="avatar">${esc(user().name.slice(-2))}</span>${esc(user().name)} 님</div></header><main id="main">${state.wizard ? `<div class="hint row"><span>ChoirON 시작하기 · ${state.wizard}/5</span>${btn("설정 계속", "wizard-resume", "", "soft")}</div>` : ""}${page()}</main></div>`;
}
function page() {
  return ({ home, calendar, history, profile, manage, members, settings }[state.page] || home)();
}
function home() {
  const d = data(), today = d.sessions.filter((s) => dayKey(s.start) === dayKey(/* @__PURE__ */ new Date())), next = d.sessions.filter((s) => Date.parse(s.start) > Date.now() && s.status === "active").sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
  const mine = db().memberships.find((m) => m.choirId === state.choir && m.userId === user().id);
  const finished = d.sessions.filter((s) => mine && C.expected(s, mine, Date.now()) && dayKey(s.start).startsWith(dayKey(/* @__PURE__ */ new Date()).slice(0, 7)));
  const count = finished.filter((s) => status(s) === "present").length;
  return title("A VOICE, TOGETHER", `${esc(user().name)} 님, 반갑습니다.`, `${fmt(/* @__PURE__ */ new Date(), { year: "numeric", month: "long", day: "numeric", weekday: "long" })} · 오늘도 함께 목소리를 모아요.`) + `<section class="hero"><div><div class="eyebrow">BETTER TOGETHER</div><h2>우리의 찬양이<br>하나로 이어지는 곳.</h2><p>${esc(current()?.name || "새로운 찬양대를 만들어 보세요.")}와 함께하는 소중한 시간</p></div><div class="hero-stat"><strong>${count}<span> / ${finished.length}</span></strong><span>이번 달 함께한 연습</span></div></section><div class="grid"><section class="card"><div class="card-head"><h2>오늘의 일정</h2><span class="badge">${today.length}개의 일정</span></div>${today.length ? today.map((s) => sessionCard(s)).join("") : `<div class="empty">오늘은 예정된 연습이 없습니다.<br>다음 연습에서 만나요.</div>${btn("전체 일정 보기", "calendar", "", "soft")}`}<p class="privacy">⌖ 위치는 출석할 때만 확인하며, 좌표는 저장하지 않습니다.</p></section><div><section class="card"><div class="card-head"><h2>다가오는 연습</h2><button class="btn small soft" data-page="calendar">전체 보기 ↗</button></div>${next.length ? next.map((s) => `<div class="upcoming"><div class="datebox"><small>${new Date(s.start).getMonth() + 1}월</small>${new Date(s.start).getDate()}</div><div><h3>${esc(s.title)}</h3><p>${fmt(s.start)} · ${time(s.start)}</p><span class="muted">${esc(d.places.find((p) => p.id === s.placeId)?.name || "")}</span></div></div>`).join("") : '<p class="muted">새로운 연습 일정을 기다리고 있어요.</p>'}</section><section class="card"><div class="card-head"><h2>차곡차곡 쌓이는 참여</h2><span class="badge green">MY RECORD</span></div><p class="muted">작은 참여가 아름다운 화음을 만듭니다.</p><div class="progress"><div style="width:${finished.length ? count / finished.length * 100 : 0}%"></div></div><div class="row"><strong>이번 달 출석률</strong><strong style="color:var(--primary)">${finished.length ? Math.round(count / finished.length * 100) + "%" : "—"}</strong></div></section></div></div>`;
}
function sessionCard(s) {
  const st = status(s), d = data(), open = Date.now() >= Date.parse(s.open) && Date.now() <= Date.parse(s.close) && s.status === "active" && current()?.status === "active";
  return `<article class="session"><div class="row"><span class="badge">${esc(current()?.name)}</span>${badge(st)}</div><h3>${esc(s.title)}</h3><p class="meta">◷ ${time(s.start)} – ${time(s.end)}</p><p class="meta">⌖ ${esc(d.places.find((p) => p.id === s.placeId)?.name || "")}</p><p class="muted">출석 가능 ${fmt(s.open)} ${time(s.open)} ~ ${fmt(s.close)} ${time(s.close)}</p><button class="checkin" data-action="checkin" data-id="${esc(s.id)}" ${!open || st === "present" ? "disabled" : ""}>${st === "present" ? "✓ 출석했습니다" : s.status === "cancelled" ? "취소된 일정" : open ? "출석하기" : "출석 시간이 아닙니다"}</button><button class="absence" data-action="absence" data-id="${esc(s.id)}" ${Date.now() > Date.parse(s.close) || st === "present" || s.status === "cancelled" ? "disabled" : ""}>결석 예정 알리기</button></article>`;
}
function calendar() {
  const month = state.calendar, first = new Date(month.getFullYear(), month.getMonth(), 1), start = new Date(first);
  start.setDate(1 - first.getDay());
  const all = db().choirs.flatMap((c) => (state.data[c.id]?.sessions || []).map((s) => ({ ...s, choir: c })));
  let cells = ["일", "월", "화", "수", "목", "금", "토"].map((v) => `<div class="cal-head">${v}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    cells += `<div class="cal-cell ${d.getMonth() !== month.getMonth() ? "out" : ""} ${dayKey(d) === dayKey(/* @__PURE__ */ new Date()) ? "today" : ""}"><span class="day">${d.getDate()}</span>${all.filter((s) => dayKey(s.start) === dayKey(d)).map((s) => `<button class="cal-event" data-action="event" data-id="${esc(s.id)}" data-choir="${esc(s.choir.id)}">${s.status === "cancelled" ? "취소 · " : ""}${time(s.start)} ${esc(s.choir.name)}<br>${esc(s.title)}</button>`).join("")}</div>`;
  }
  return title("OUR SCHEDULE", "함께할 다음 시간", "내가 소속된 찬양대의 모든 연습을 한눈에 확인하세요.", admin() ? btn("+ 일정 추가", "session-new", "", "") : "") + `<section class="card"><div class="card-head"><div class="row">${btn("‹", "month-prev", 'aria-label="이전 달"', "small secondary")}<span class="month-name">${month.getFullYear()}년 ${month.getMonth() + 1}월</span>${btn("›", "month-next", 'aria-label="다음 달"', "small secondary")}</div>${btn("오늘", "month-today", "", "small soft")}</div><div class="calendar">${cells}</div><p class="muted">일정을 선택하면 Google Calendar에 추가하거나 Apple Calendar용 파일을 받을 수 있습니다.</p></section>`;
}
function history() {
  const d = data(), ss = d.sessions.filter((s) => dayKey(s.start).startsWith(state.month) && s.title.includes(state.query)).sort((a, b) => b.start.localeCompare(a.start)), count = ss.filter((s) => status(s) === "present").length;
  return title("MY ATTENDANCE", "나의 출결", "함께한 시간을 월별·연간으로 돌아보세요.") + `<div class="toolbar"><input type="month" id="historyMonth" aria-label="조회 월" value="${state.month.length === 7 ? state.month : state.month + "-01"}">${btn("연간 보기", "year-view")}${btn("Excel 다운로드", "my-export")}<input id="historyQuery" placeholder="일정 검색" aria-label="일정 검색" value="${esc(state.query)}"></div><div class="stats"><div class="stat"><span>조회 기간</span><strong>${state.month}</strong></div><div class="stat"><span>출석</span><strong>${count}</strong></div><div class="stat"><span>결석</span><strong>${ss.filter((s) => status(s) === "absent").length}</strong></div><div class="stat"><span>인정결석</span><strong>${ss.filter((s) => status(s) === "excused").length}</strong></div></div><section class="card"><div class="table-wrap"><table><thead><tr><th>날짜</th><th>연습 일정</th><th>시간</th><th>출결</th></tr></thead><tbody>${ss.map((s) => `<tr><td>${fmt(s.start)}</td><td><button class="btn small secondary" data-action="event" data-id="${esc(s.id)}">${esc(s.title)}</button></td><td>${time(s.start)}</td><td>${badge(status(s))}</td></tr>`).join("")}</tbody></table>${!ss.length ? '<p class="empty">해당 기간의 일정이 없습니다.</p>' : ""}</div></section>`;
}
function profile() {
  return title("MY PROFILE", "내 정보", "나의 소속과 계정 정보를 확인하세요.") + `<div class="settings-grid"><section class="card"><div class="row"><span class="avatar" style="width:80px;height:80px;font-size:25px">${esc(user().name.slice(-2))}</span><div><h2>${esc(user().name)}</h2><p class="muted">단원 ID · ${esc(user().id)}</p></div></div><div class="toolbar">${btn("프로필 사진 보기", "photo-view")}<label class="btn secondary file-label">사진 변경<input type="file" id="photoFile" accept="image/png,image/jpeg,image/webp"></label></div><p class="muted">사진은 Workspace 관리자 Drive에 저장됩니다.</p>${btn("PIN 변경", "pin")}${btn("로그아웃", "logout", "", "secondary")}</section><section class="card"><h2>나의 찬양대</h2>${db().memberships.filter((m) => m.userId === user().id).map((m) => `<div class="upcoming"><span class="avatar">♪</span><div><h3>${esc(db().choirs.find((c) => c.id === m.choirId)?.name || m.choirId)}</h3><p>${esc(m.part)} · ${db().roles.filter((r) => r.userId === user().id && r.choirId === m.choirId).map((r) => roleNames[r.role]).join(", ")}</p></div></div>`).join("")}${user().workspaceAdmin ? '<span class="badge">Workspace 관리자</span>' : ""}</section></div><section class="card"><h2>앱과 연결</h2>${select("현재 찬양대", "switchChoir", db().choirs.map((c) => [c.id, c.name]), state.choir)}<div class="toolbar">${btn("Workspace 연결", "connect")}${btn("앱 설치 안내", "install")}${api.isDemo ? select("체험할 역할", "mobilePersona", [["kim", "단원 · 김은혜"], ["lee", "파트장 · 이영준"], ["park", "서기 · 박서연"], ["admin", "관리자 · 정하늘"]], user().id) : ""}</div><p class="muted">앱은 인터넷 연결이 필요합니다. 오프라인 출석은 접수하지 않습니다.</p></section>`;
}
function manage() {
  if (!has(["leader", "secretary", "admin"])) return '<p class="empty">출결 관리 권한이 없습니다.</p>';
  const d = data(), ss = d.sessions.filter((s) => dayKey(s.start).startsWith(state.month)).sort((a, b) => b.start.localeCompare(a.start));
  const ms = db().memberships.filter((m) => m.choirId === state.choir && C.canRead(db(), user(), state.choir, m.userId));
  return title("ATTENDANCE DESK", "출결 관리", has(["admin", "secretary"]) ? "찬양대 전체 출결을 확인하고 정정할 수 있습니다." : "내 파트의 출결을 확인하고 정정할 수 있습니다.", btn("리포트 다운로드", "report", "", "")) + `<div class="toolbar"><input id="historyMonth" type="month" value="${state.month.slice(0, 7)}" aria-label="출결 조회 월">${btn("연간 보기", "year-view")}<select id="manageSession" aria-label="출결 관리 일정">${ss.map((s) => `<option value="${esc(s.id)}" ${state.manageSession === s.id ? "selected" : ""}>${fmt(s.start)} ${esc(s.title)}${s.status === "cancelled" ? " (취소)" : ""}</option>`).join("")}</select></div><section class="card">${ss.length ? attendanceTable(ss.find((s) => s.id === state.manageSession) || ss[0], ms) : '<p class="empty">조회 기간의 일정이 없습니다.</p>'}</section>`;
}
function attendanceTable(s, ms) {
  state.manageSession = s.id;
  return `<h2>${esc(s.title)} · ${fmt(s.start)}</h2><div class="table-wrap"><table><thead><tr><th>단원</th><th>파트</th><th>상태</th><th>결석 사유</th><th>정정</th></tr></thead><tbody>${ms.map((m) => `<tr><td>${esc(db().users.find((u) => u.id === m.userId)?.name || m.userId)}</td><td>${esc(m.part)}</td><td>${badge(status(s, m.userId))}</td><td>${esc(data().reasons.find((r) => r.userId === m.userId && r.sessionId === s.id)?.reason || "—")}</td><td>${btn("정정", "correct", `data-id="${esc(m.userId)}" ${s.status === "cancelled" ? "disabled" : ""}`, "small secondary")}</td></tr>`).join("")}</tbody></table></div>`;
}
function members() {
  if (!admin()) return '<p class="empty">관리자 권한이 없습니다.</p>';
  const ms = db().memberships.filter((m) => m.choirId === state.choir);
  return title("OUR PEOPLE", "함께하는 단원", `${esc(current()?.name)} · ${ms.length}명`, btn("+ 단원 등록", "member-new", "", "")) + `<div class="toolbar">${btn("일괄등록 양식", "member-template")}<label class="btn secondary file-label">Excel 일괄등록<input id="memberFile" type="file" accept=".xlsx"></label>${btn("단원 다운로드", "member-export")}</div><section class="card"><div class="table-wrap"><table><thead><tr><th>단원</th><th>ID</th><th>파트</th><th>권한</th><th>활동</th><th>관리</th></tr></thead><tbody>${ms.map((m) => `<tr><td>${esc(db().users.find((u) => u.id === m.userId)?.name || m.userId)}</td><td>${esc(m.userId)}</td><td>${esc(m.part)}</td><td>${db().roles.filter((r) => r.userId === m.userId && r.choirId === state.choir).map((r) => roleNames[r.role]).join(", ")}</td><td>${{ active: "활동", paused: "휴단", withdrawn: "탈퇴" }[m.status]}</td><td>${btn("수정", "member-edit", `data-id="${esc(m.userId)}"`, "small secondary")}</td></tr>`).join("")}</tbody></table></div></section>`;
}
function settings() {
  if (!admin() && !user().workspaceAdmin) return '<p class="empty">관리자 권한이 없습니다.</p>';
  return title("WORKSPACE SETTINGS", "우리에게 맞는 공간", "찬양대의 운영 환경을 설정하세요.") + `<div class="settings-grid"><section class="card"><h2>찬양대 운영</h2><div class="toolbar">${btn("일정 추가", "session-new", "", "")}${btn("장소 추가", "place-new")}</div>${data().places.map((p) => `<div class="upcoming"><div><h3>${esc(p.name)}</h3><p>허용 반경 ${p.radius ?? "—"}m</p></div>${btn("수정", "place-edit", `data-id="${esc(p.id)}"`, "small secondary")}</div>`).join("")}<div class="toolbar">${btn("감사 기록", "audit")}${btn("리포트 다운로드", "report")}</div></section>${user().workspaceAdmin ? `<section class="card"><h2>Workspace 디자인</h2><p class="muted">테마를 눌러 미리 보고, 저장하면 모두에게 적용됩니다.</p><div class="themes">${Object.entries(themes).map(([id, [name, color]]) => `<button class="theme ${id === db().workspace.theme ? "selected" : ""}" data-action="theme" data-id="${id}"><span class="swatch" style="background:${color}"></span>${name}</button>`).join("")}</div><div class="toolbar">${btn("이름·로고·테마 저장", "workspace-edit", "", "")}</div></section><section class="card"><h2>찬양대와 데이터</h2>${db().choirs.map((c) => `<div class="upcoming"><div><h3>${esc(c.name)}</h3><p>${c.status === "active" ? "운영중" : "보관"}</p></div>${btn("연결 관리", "choir-edit", `data-id="${esc(c.id)}"`, "small secondary")}</div>`).join("")}<div class="toolbar">${btn("+ 찬양대 만들기", "choir-new")}${btn("연결 정보", "data-info")}</div></section><section class="card"><h2>백업과 관리자</h2><p class="muted">하루에 한 번 관리자 Drive로 자동 백업합니다.</p><div class="toolbar">${btn("지금 백업", "backup")}${btn("백업 복원", "backups")}${btn("관리자 이양", "transfer")}</div><p class="muted">복원 전 현재 데이터를 백업하며, 복원 후 모든 계정은 다시 로그인합니다.</p></section>` : ""}</div>`;
}
function modal(title2, body, onSubmit, submitLabel = "저장") {
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialogTitle">${title2}</h2><button class="close" data-close aria-label="닫기">×</button></div>${onSubmit ? '<form id="modalForm">' : ""}${body}<p class="error" id="modalError" role="alert"></p>${onSubmit ? `<div class="actions"><button type="button" class="btn secondary" data-close>취소</button><button type="submit" class="btn">${submitLabel}</button></div></form>` : ""}`;
  if (!dialog.open) dialog.showModal();
  if (onSubmit) $("#modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget, values = Object.fromEntries(new FormData(form)), button = form.querySelector("[type=submit]");
    button.disabled = true;
    $("#modalError").textContent = "";
    try {
      await onSubmit(values, form);
      if (dialog.querySelector("#modalForm") === form) dialog.close();
    } catch (err) {
      const error = $("#modalError");
      if (error) error.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
}
function datetime(s) {
  const d = new Date(s);
  return dayKey(d) + "T" + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function pinDialog(required = false) {
  modal(required ? "초기 PIN을 변경해 주세요" : "PIN 변경", `<p class="muted">숫자 6~12자리로 설정해 주세요.</p>${field("현재 PIN", "oldPin", "", "password", 'required inputmode="numeric" autocomplete="current-password"')}${field("새 PIN", "pin", "", "password", 'required pattern="[0-9]{6,12}" inputmode="numeric" autocomplete="new-password"')}${field("새 PIN 확인", "confirm", "", "password", 'required inputmode="numeric"')}`, async (p) => {
    if (p.pin !== p.confirm) throw new Error("새 PIN이 일치하지 않습니다.");
    await api.request("changePin", p);
    await refresh();
    toast("PIN을 변경했습니다.");
  });
}
function sessionDialog(id) {
  if (!current()) throw new Error("찬양대를 먼저 만들어 주세요.");
  if (!data().places.length) {
    placeDialog();
    return;
  }
  const s = data().sessions.find((s2) => s2.id === id) || { id: uid(), title: "주일 찬양 연습", placeId: data().places[0].id, start: /* @__PURE__ */ new Date(), end: new Date(Date.now() + 72e5), open: new Date(Date.now() - 36e5), close: new Date(Date.now() + 72e5), status: "active" };
  modal(id ? "연습 일정 수정" : "새 연습 일정", `<div class="form-grid">${field("일정 이름", "title", s.title, "text", 'required maxlength="100"')}${select("장소", "placeId", data().places.map((p) => [p.id, p.name]), s.placeId)}${field("연습 시작", "start", datetime(s.start), "datetime-local", "required")}${field("연습 종료", "end", datetime(s.end), "datetime-local", "required")}${field("출석 허용 시작", "open", datetime(s.open), "datetime-local", "required")}${field("출석 마감", "close", datetime(s.close), "datetime-local", "required")}${select("일정 상태", "status", [["active", "운영"], ["cancelled", "취소"]], s.status)}</div><p class="muted">현재 기기의 시간대(${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)})로 입력합니다. 출석 시간은 연습시간과 별도로 적용됩니다.</p>`, async (p) => {
    for (const k of ["start", "end", "open", "close"]) p[k] = new Date(p[k]).toISOString();
    await mutate("sessionSave", { ...p, id: s.id });
    if (state.wizard === 5) {
      state.wizard = 0;
      render();
    }
    toast("일정을 저장했습니다.");
  });
}
function placeDialog(id) {
  if (!current()) throw new Error("찬양대를 먼저 만들어 주세요.");
  const p = data().places.find((p2) => p2.id === id) || { id: uid(), name: "", lat: "", lng: "", radius: 150 };
  modal("출석 장소 설정", `${field("장소 이름", "name", p.name, "text", "required")}${btn("현재 위치로 채우기", "locate", "", "soft")}<div class="form-grid">${field("위도", "lat", p.lat, "number", 'required step="any" min="-90" max="90"')}${field("경도", "lng", p.lng, "number", 'required step="any" min="-180" max="180"')}${field("허용 반경 (m)", "radius", p.radius, "number", 'required min="10" max="3000"')}</div><p class="muted">관리자가 지정한 장소의 좌표만 저장합니다. 단원의 출석 좌표는 저장하지 않습니다.</p>`, async (v) => {
    await mutate("placeSave", { ...v, id: p.id, lat: Number(v.lat), lng: Number(v.lng), radius: Number(v.radius) });
    if (state.wizard === 5) {
      dialog.close();
      sessionDialog();
    } else toast("장소를 저장했습니다.");
  });
}
function memberDialog(id) {
  const m = db().memberships.find((m2) => m2.userId === id && m2.choirId === state.choir), u = db().users.find((u2) => u2.id === id), rr = db().roles.filter((r) => r.userId === id && r.choirId === state.choir).map((r) => r.role);
  modal(id ? "단원 정보 수정" : "단원 등록", `<div class="form-grid">${field("단원 ID", "id", id || "", "text", `required pattern="[A-Za-z0-9_-]{1,64}" ${id ? "readonly" : ""}`)}${field("이름", "name", u?.name || "", "text", "required")}${field("파트", "part", m?.part || "소프라노", "text", "required")}${select("활동 상태", "status", [["active", "활동"], ["paused", "휴단"], ["withdrawn", "탈퇴"]], m?.status || "active")}${field(id ? "PIN 재설정 (선택 · Workspace 관리자만)" : "초기 PIN", "pin", "", "password", `${id ? "" : "required"} pattern="[0-9]{6,12}" inputmode="numeric" autocomplete="new-password"`)}</div><p class="muted">기존 ID를 입력하면 같은 계정을 이 찬양대에도 등록합니다. 초기 PIN은 첫 로그인 시 변경합니다.</p><div class="roles">${Object.entries(roleNames).map(([r, n]) => `<label><input type="checkbox" name="roles" value="${r}" ${(rr.length ? rr : ["member"]).includes(r) ? "checked" : ""}>${n}</label>`).join("")}</div>`, async (p, form) => {
    p.roles = new FormData(form).getAll("roles");
    await mutate("memberSave", p);
    toast("단원을 저장했습니다.");
    if (state.wizard === 4) {
      state.wizard = 5;
      dialog.close();
      placeDialog();
    }
  });
}
function choirDialog(id) {
  const c = db().choirs.find((c2) => c2.id === id);
  modal(id ? "찬양대 설정" : "찬양대 만들기", field("찬양대 ID", "id", c?.id || uid(), "text", id ? "readonly required" : 'required pattern="[A-Za-z0-9_-]{1,64}"') + field("찬양대 이름", "name", c?.name || "", "text", "required") + select("운영 상태", "status", [["active", "운영중"], ["archived", "보관"]], c?.status || "active") + '<p class="muted">새 찬양대의 Google Sheet는 자동으로 만들어집니다.</p>', async (p) => {
    await mutate("choirSave", p);
    state.choir = p.id;
    render();
    toast("찬양대를 저장했습니다.");
  });
}
function eventDialog(id, cid = state.choir) {
  const d = state.data[cid], s = d.sessions.find((s2) => s2.id === id), c = db().choirs.find((c2) => c2.id === cid), place = d.places.find((p) => p.id === s.placeId)?.name || "";
  modal(esc(s.title), `<span class="badge">${esc(c.name)}</span><p>${fmt(s.start)} · ${time(s.start)}–${time(s.end)}</p><p>${esc(place)}</p>${badge(status(s, user().id, d))}<div class="toolbar">${s.status === "active" ? `<a class="btn" href="${esc(googleCalendar(s, c, place))}" target="_blank" rel="noopener noreferrer">Google Calendar에 추가 ↗</a>` : ""}${btn("Apple / .ics 파일", "ics", `data-id="${esc(id)}" data-choir="${esc(cid)}"`)}</div><p class="muted">개별 일정의 사본을 추가합니다. 앱에서 일정이 변경되어도 이미 추가한 캘린더에는 자동 반영되지 않습니다.</p>${cid === state.choir && C.has(db(), user(), cid, ["admin"]) ? btn("일정 수정·취소", "session-edit", `data-id="${esc(id)}"`) : ""}${cid === state.choir && s.status === "active" ? btn("결석 예정 입력", "absence", `data-id="${esc(id)}"`) : ""}`);
}
async function findWorkspace(code) {
  if (!apiBase) throw new Error("서비스 운영자의 연결 서버 설정이 필요합니다. 지금은 데모를 둘러보실 수 있습니다.");
  const r = await fetch(apiBase + "/api/lookup?code=" + encodeURIComponent(code));
  const result = await r.json();
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
async function activateWorkspace(trial, code) {
  // Read everything before replacing the active workspace, so failure is isolated.
  const snapshot = await trial.request("snapshot"), nextData = {};
  if (!snapshot.mustChange) for (const c of snapshot.choirs) nextData[c.id] = await trial.request("choirData", {choirId:c.id});
  api = trial;
  activeCode = code;
  workspaces.remember(code, snapshot.workspace.name, trial);
  Object.assign(state, {snapshot, data:nextData, choir:snapshot.choirs[0]?.id || "", page:"home", query:"", wizard:0});
  window.history.replaceState(null, "", location.pathname + "?workspace=" + encodeURIComponent(code));
  dialog.close();
  render();
  if (snapshot.mustChange) pinDialog(true);
}
function workspaceDialog() {
  modal("내 Workspace", '<p class="muted">선택한 곳의 일정과 출석만 표시합니다. 앱을 닫거나 새로고침하면 다시 로그인해 주세요.</p>' +
    workspaces.items.map(w => `<div class="upcoming"><div><h3>${esc(w.name)}</h3><p>${esc(w.code)} · ${!api.isDemo && activeCode === w.code ? "현재 사용 중" : workspaces.sessions.has(w.code) ? "로그인됨" : "로그인 필요"}</p></div>${btn("열기", "workspace-open", `data-code="${esc(w.code)}"`)}${activeCode !== w.code || api.isDemo ? btn("목록에서 삭제", "workspace-forget", `data-code="${esc(w.code)}"`, "small secondary") : ""}</div>`).join("") +
    '<div class="toolbar">' + btn("+ Workspace 추가", "workspace-add") + btn("데모 둘러보기", "demo") + '</div>');
}
function connectDialog(code = "") {
  if (typeof code !== "string") code = "";
  code ||= new URLSearchParams(location.search).get("workspace") || "";
  modal("우리 Workspace에 로그인", field("Workspace 코드", "code", code, "text", "required") + field("단원 ID", "id", "", "text", 'required autocomplete="username"') + field("PIN", "pin", "", "password", 'required inputmode="numeric" autocomplete="current-password"') + '<p class="muted">관리자가 보내드린 코드와 개인 ID를 사용하세요. PIN은 기기에 저장하지 않습니다.</p><div class="toolbar">' + btn("내 Workspace", "connect") + btn("관리자 설정 이어가기", "setup-start", "", "soft") + "</div>", async (p) => {
    const workspace = await findWorkspace(p.code), trial = new API();
    trial.connect(workspace.url);
    const result = await trial.request("login", { id: p.id, pin: p.pin });
    trial.token = result.token;
    await activateWorkspace(trial, workspace.url.split("/").pop());
  }, "로그인");
}
function setupStart() {
  location.href = apiBase ? apiBase + "/portal/start.html" : "./start.html?demo=1";
}
async function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("위치 기능을 지원하지 않는 기기입니다."));
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => reject(new Error("위치 권한을 허용하고 다시 시도해 주세요.")), { enableHighAccuracy: true, timeout: 15e3, maximumAge: 0 });
  });
}
async function checkin(id) {
  if (!api.isDemo && !navigator.onLine) throw new Error("인터넷 연결 후 출석해 주세요.");
  const coords = api.isDemo ? data().places.find((p) => p.id === data().sessions.find((s) => s.id === id).placeId) : await locate();
  await mutate("checkin", { sessionId: id, coords: { lat: coords.lat, lng: coords.lng } });
  toast(api.isDemo ? "데모 출석을 완료했습니다. (GPS 검증은 가상 위치)" : "출석이 완료되었습니다. 함께해 주셔서 감사합니다.");
}
function absenceDialog(id) {
  modal("결석 예정 알리기", `<p class="muted">실제로 참석하면 출석하기 버튼으로 출석 전환됩니다.</p><label class="field">결석 사유<textarea name="reason" required maxlength="500">${esc(data().reasons.find((r) => r.sessionId === id && r.userId === user().id)?.reason || "")}</textarea></label>`, async (p) => {
    await mutate("absence", { sessionId: id, ...p });
    toast("결석 예정을 전달했습니다.");
  });
}
function correctDialog(id) {
  modal("출결 정정", `${select("출결 상태", "status", [["present", "출석"], ["absent", "결석"], ["excused", "인정결석"]], "present")}<label class="field">정정 사유<textarea name="reason" required maxlength="500"></textarea></label><p class="muted">누가 언제 변경했는지 감사 기록에 남습니다.</p>`, async (p) => {
    await mutate("correct", { sessionId: state.manageSession, userId: id, ...p });
    toast("출결을 정정했습니다.");
  });
}
async function report() {
  const r = reports[0];
  const rows = r.build({ ...data(), users: db().users, memberships: db().memberships.filter((m) => m.choirId === state.choir) }, state.month);
  await exportExcel(r.columns, rows, `ChoirON-${state.month}-report.xlsx`);
}
async function workspaceEdit() {
  modal("Workspace 디자인 저장", `${field("Workspace 이름", "name", db().workspace.name, "text", "required")}${select("디자인 테마", "theme", Object.entries(themes).map(([id, [n]]) => [id, n]), document.documentElement.dataset.theme)}<label class="field">로고 파일 (75KB 이하)<input name="logoFile" type="file" accept="image/png,image/jpeg,image/webp"></label><label><input name="removeLogo" type="checkbox"> 기존 로고 지우기</label>`, async (p, form) => {
    const f = form.elements.logoFile.files[0];
    let logo = p.removeLogo ? "" : db().workspace.logo;
    if (f) {
      if (f.size > 75e3) throw new Error("로고는 75KB 이하입니다.");
      logo = await dataURL(f);
    }
    await mutate("workspaceSave", { name: p.name, theme: p.theme, logo });
    toast("Workspace 디자인을 적용했습니다.");
  });
}
function dataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function bulkImport(file) {
  const rows = await importExcel(file);
  const seen = /* @__PURE__ */ new Set();
  rows.forEach((r, i) => {
    try {
      C.id(r.id);
      C.text(r.name);
      C.text(r.part);
      if (r.pin) C.pin(r.pin);
      else if (!db().users.some((u) => u.id === r.id)) throw new Error("신규 단원 PIN이 필요합니다.");
      if (!r.roles.length || !r.roles.every((v) => C.roles.includes(v))) throw new Error("권한 코드를 확인하세요.");
      if (!["active", "paused", "withdrawn"].includes(r.status)) throw new Error("상태를 확인하세요.");
      if (seen.has(r.id)) throw new Error("중복 ID입니다.");
      seen.add(r.id);
    } catch (e) {
      throw new Error(`${i + 2}행: ${e.message}`);
    }
  });
  modal(`일괄 등록 확인 · ${rows.length}명`, `<p class="muted">기존 ID는 이 찬양대의 소속·권한을 업데이트합니다. 기존 계정의 PIN 재설정은 Workspace 관리자만 가능합니다.</p><div class="table-wrap"><table><tr><th>ID</th><th>이름</th><th>파트</th></tr>${rows.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${esc(r.part)}</td></tr>`).join("")}</table></div>`, async () => {
    let completed = 0;
    try {
      for (const row of rows) {
        await api.request("memberSave", { choirId: state.choir, ...row });
        completed++;
        $("#modalError").textContent = `${completed}/${rows.length}명 처리 중…`;
      }
    } catch (e) {
      await refresh();
      throw new Error(`${completed}명 저장 완료. ${rows[completed]?.id}부터 실패: ${e.message} 완료한 행을 제외하고 다시 등록하세요.`);
    }
    await refresh();
    toast(`${completed}명을 등록했습니다.`);
  }, "등록 실행");
}
const actions = {
  connect: workspaceDialog,
  "workspace-add": () => connectDialog(),
  "workspace-open": async (el) => {
    const code = el.dataset.code, session = workspaces.sessions.get(code);
    if (!session) return connectDialog(code);
    try { await activateWorkspace(session, code); }
    catch (error) {
      workspaces.logout(code);
      connectDialog(code);
      toast("해당 Workspace를 열지 못했습니다. 현재 Workspace는 유지됩니다. " + error.message);
    }
  },
  "workspace-forget": (el) => { workspaces.forget(el.dataset.code); workspaceDialog(); },
  demo: async () => {
    api = new API();
    activeCode = "";
    state.page = "home";
    dialog.close();
    await refresh();
  },
  calendar: () => {
    state.page = "calendar";
    render();
  },
  checkin: (el) => checkin(el.dataset.id),
  absence: (el) => absenceDialog(el.dataset.id),
  correct: (el) => correctDialog(el.dataset.id),
  event: (el) => eventDialog(el.dataset.id, el.dataset.choir),
  "month-prev": () => {
    state.calendar = new Date(state.calendar.getFullYear(), state.calendar.getMonth() - 1, 1);
    render();
  },
  "month-next": () => {
    state.calendar = new Date(state.calendar.getFullYear(), state.calendar.getMonth() + 1, 1);
    render();
  },
  "month-today": () => {
    state.calendar = /* @__PURE__ */ new Date();
    render();
  },
  ics: (el) => {
    const cid = el.dataset.choir || state.choir, d = state.data[cid], s = d.sessions.find((s2) => s2.id === el.dataset.id);
    download(ics(s, db().workspace, db().choirs.find((c) => c.id === cid), d.places.find((p) => p.id === s.placeId)?.name), `ChoirON-${s.id}.ics`, "text/calendar;charset=utf-8");
  },
  "year-view": () => {
    state.month = state.month.slice(0, 4);
    render();
  },
  "my-export": () => exportExcel(["날짜", "일정", "출결"], data().sessions.filter((s) => dayKey(s.start).startsWith(state.month)).map((s) => [fmt(s.start), s.title, statusNames[status(s)]]), "ChoirON-my-attendance.xlsx"),
  pin: () => pinDialog(),
  logout: async () => {
    await api.request("logout");
    workspaces.logout(activeCode);
    api.token = "";
    state.snapshot = null;
    state.data = {};
    app.innerHTML = '<p class="loading">로그아웃했습니다. <button class="btn" data-action="connect">다시 로그인</button></p>';
    connectDialog();
  },
  "session-new": () => sessionDialog(),
  "session-edit": (el) => sessionDialog(el.dataset.id),
  "place-new": () => placeDialog(),
  "place-edit": (el) => placeDialog(el.dataset.id),
  "member-new": () => memberDialog(),
  "member-edit": (el) => memberDialog(el.dataset.id),
  "choir-new": () => choirDialog(),
  "choir-edit": (el) => choirDialog(el.dataset.id),
  locate: async () => {
    const p = await locate();
    dialog.querySelector("[name=lat]").value = p.lat;
    dialog.querySelector("[name=lng]").value = p.lng;
  },
  "member-template": () => exportExcel(["ID", "이름", "파트", "권한", "상태", "초기PIN"], [["sample01", "홍길동", "테너", "member", "active", "654321"]], "ChoirON-member-template.xlsx"),
  "member-export": () => exportExcel(["ID", "이름", "파트", "권한", "상태", "초기PIN"], db().memberships.filter((m) => m.choirId === state.choir).map((m) => [m.userId, db().users.find((u) => u.id === m.userId)?.name || "", m.part, db().roles.filter((r) => r.userId === m.userId && r.choirId === state.choir).map((r) => r.role).join(","), m.status, ""]), "ChoirON-members.xlsx"),
  report,
  theme: (el) => {
    document.documentElement.dataset.theme = el.dataset.id;
    dialog.open && dialog.close();
    toast("테마 미리보기입니다. 이름·로고·테마 저장을 눌러 적용해 주세요.");
  },
  "workspace-edit": workspaceEdit,
  "setup-start": setupStart,
  "wizard-resume": () => {
    if (state.wizard < 3) setupStart();
    else if (state.wizard === 3) choirDialog();
    else if (state.wizard === 4) memberDialog();
    else placeDialog();
  },
  audit: async () => {
    const rows = await api.request("audit", { choirId: state.choir });
    modal("감사 기록", rows.length ? rows.reverse().map((r) => `<div class="audit-line"><strong>${esc(r.action)} · ${esc(r.actor)}</strong><br>${esc(r.at)}<br>${esc(r.target)} ${esc(r.reason)}</div>`).join("") : '<p class="empty">기록이 없습니다.</p>');
  },
  backup: async () => {
    await api.request("backup");
    toast("관리자 Drive에 백업했습니다.");
  },
  backups: async () => {
    const rows = await api.request("backups");
    modal("백업 복원", `<p class="muted">현재 상태를 먼저 백업하고 선택한 시점으로 돌아갑니다. 단원 등록·권한·출결·사진이 복원됩니다.</p>${select("복원할 백업", "fileId", rows.map((r) => [r.fileId, r.at]), rows[0]?.fileId)}${field("확인을 위해 “복원” 입력", "confirmation", "", "text", "required")}`, async (p) => {
      if (p.confirmation !== "복원") throw new Error("복원을 입력해 주세요.");
      await api.request("restore", p);
      api.token = "";
      state.snapshot = null;
      state.data = {};
      app.innerHTML = '<p class="loading">복원되었습니다. 다시 로그인해 주세요.</p>';
      connectDialog();
    }, "복원 실행");
  },
  "data-info": async () => {
    const info = await api.request("dataInfo");
    modal("데이터 연결 정보", `<p class="muted">관리자 계정으로 Google Drive에서 확인하실 수 있습니다.</p><pre style="white-space:pre-wrap;word-break:break-all;font-size:12px">${esc(JSON.stringify(info, null, 2))}</pre>`);
  },
  transfer: () => modal("Workspace 관리자 이양", `${select("새 관리자", "userId", db().users.filter((u) => u.id !== user().id && u.status === "active").map((u) => [u.id, `${u.name} (${u.id})`]), "")}<p class="muted">앱 관리 권한을 이양합니다. Google 파일 소유권과 Apps Script 배포 계정 변경은 README의 별도 절차를 따라 주세요.</p>`, async (p) => {
    await mutate("transferAdmin", p);
    state.page = "home";
    render();
    toast("관리자 권한을 이양했습니다.");
  }),
  "photo-view": async () => {
    const image = await api.request("photoGet");
    modal("내 프로필 사진", image ? `<img src="${esc(image)}" alt="내 프로필 사진" style="max-width:100%;border-radius:16px">` : '<p class="empty">등록된 사진이 없습니다.</p>');
  },
  install: () => modal("홈 화면에 ChoirON 추가", `<p>Android Chrome: 브라우저 메뉴 → 앱 설치 또는 홈 화면에 추가</p><p>iPhone Safari: 공유 → 홈 화면에 추가</p><p>PC Chrome / Edge: 주소 표시줄의 설치 아이콘을 선택해 주세요.</p><p class="muted">출석에는 인터넷 연결과 위치 권한이 필요합니다.</p>`)
};
document.addEventListener("click", async (e) => {
  const close = e.target.closest("[data-close]");
  if (close) {
    dialog.close();
    return;
  }
  const page2 = e.target.closest("[data-page]");
  if (page2) {
    state.page = page2.dataset.page;
    render();
    window.scrollTo(0, 0);
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  el.disabled = true;
  try {
    await fn(el);
  } catch (error) {
    toast(error.message);
  } finally {
    el.disabled = false;
  }
});
document.addEventListener("change", async (e) => {
  const el = e.target;
  try {
    if (el.id === "choirSelect" || el.name === "switchChoir") {
      state.choir = el.value;
      state.page = "home";
      render();
    }
    if (el.id === "persona" || el.name === "mobilePersona") {
      api.demo.userId = el.value;
      state.page = "home";
      await refresh();
    }
    if (el.id === "historyMonth") {
      state.month = el.value;
      render();
    }
    if (el.id === "manageSession") {
      state.manageSession = el.value;
      render();
    }
    if (el.id === "historyQuery") {
      state.query = el.value;
      render();
    }
    if (el.id === "photoFile" && el.files[0]) {
      if (el.files[0].size > 65e4) throw new Error("사진은 650KB 이하로 선택해 주세요.");
      await api.request("photoUpload", { data: await dataURL(el.files[0]) });
      toast("프로필 사진을 저장했습니다.");
    }
    if (el.id === "memberFile" && el.files[0]) {
      await bulkImport(el.files[0]);
      el.value = "";
    }
    if (el.name === "workspace") {
      const list = [...config.workspaces, ...JSON.parse(localStorage.getItem("choiron-connections") || "[]")], w = list.find((w2) => w2.code === el.value);
      if (w) {
        dialog.querySelector("[name=code]").value = w.code;
        dialog.querySelector("[name=url]").value = w.url;
      }
    }
  } catch (error) {
    toast(error.message);
  }
});
window.addEventListener("online", () => {
  toast("인터넷에 연결되었습니다.");
  if (db()) render();
});
window.addEventListener("offline", () => {
  toast("오프라인입니다. 출석은 인터넷 연결 후 가능합니다.");
  if (db()) render();
});
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {
});
async function startApp() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const token = fragment.get("token"), code = fragment.get("workspace");
  if (token && code) {
    window.history.replaceState(null, "", location.pathname + "?workspace=" + encodeURIComponent(code));
    const workspace = await findWorkspace(code);
    const trial = new API();
    trial.connect(workspace.url);
    trial.token = token;
    await activateWorkspace(trial, workspace.url.split("/").pop());
  } else {
    await refresh();
    if (apiBase && new URLSearchParams(location.search).has("workspace")) connectDialog();
  }
}
startApp().catch((e) => {
  app.innerHTML = '<p class="loading">' + esc(e.message) + "</p>";
});
