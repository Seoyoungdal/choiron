import "./domain.js";
const C = globalThis.ChoirCore;
const KEY = "choiron-demo-v1";
const iso = (date, hour, minute = 0) => {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
export function seed() {
  const now = /* @__PURE__ */ new Date(), today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const users = [{ id: "kim", name: "김은혜", status: "active", workspaceAdmin: false }, { id: "lee", name: "이영준", status: "active", workspaceAdmin: false }, { id: "park", name: "박서연", status: "active", workspaceAdmin: false }, { id: "admin", name: "정하늘", status: "active", workspaceAdmin: true }];
  const memberships = users.map((u, i) => ({ id: "jer:" + u.id, userId: u.id, choirId: "jer", part: i % 2 ? "테너" : "소프라노", status: "active", joinedAt: "2025-01-01T00:00:00Z", endedAt: "" }));
  memberships.push({ id: "elp:kim", userId: "kim", choirId: "elp", part: "소프라노", status: "active", joinedAt: "2025-01-01T00:00:00Z", endedAt: "" });
  const roles = [{ userId: "kim", choirId: "jer", role: "member" }, { userId: "kim", choirId: "elp", role: "member" }, { userId: "lee", choirId: "jer", role: "leader" }, { userId: "park", choirId: "jer", role: "secretary" }, { userId: "park", choirId: "jer", role: "leader" }, { userId: "admin", choirId: "jer", role: "admin" }];
  const data = {};
  for (const cid of ["jer", "elp"]) {
    const sessions = [], attendance = [];
    for (let i = -35; i < 29; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      if (d.getDay() !== 0 && i !== 0) continue;
      const id = cid + "-" + i;
      sessions.push({ id, title: i === 0 ? "함께하는 저녁 연습" : "주일 찬양 연습", placeId: "main", start: iso(d, 19), end: iso(d, 21), open: iso(d, 0), close: iso(d, 23, 59), status: "active" });
      if (i < 0) users.forEach((u, j) => {
        if ((i + j) % 4 !== 0) attendance.push({ id: id + ":" + u.id, sessionId: id, userId: u.id, status: "present", updatedAt: iso(d, 19), source: "checkin" });
      });
    }
    data[cid] = { sessions, attendance, reasons: [], places: [{ id: "main", name: "본당 · 2층 찬양대실", lat: 37.5665, lng: 126.978, radius: 150 }], audit: [] };
  }
  return { workspace: { id: "demo-skc", code: "SKC", name: "신광교회", theme: "blue", logo: "" }, users, memberships, roles, choirs: [{ id: "jer", name: "예루살렘 찬양대", status: "active" }, { id: "elp", name: "엘피스 찬양대", status: "active" }], data };
}
export class Demo {
  constructor() {
    try {
      this.db = JSON.parse(localStorage.getItem(KEY)) || seed();
    } catch {
      this.db = seed();
    }
    this.userId = "kim";
  }
  save() {
    localStorage.setItem(KEY, JSON.stringify(this.db));
  }
  async request(action, p = {}) {
    const db = this.db, u = db.users.find((u2) => u2.id === this.userId);
    if (action === "login") {
      this.userId = p.id || "kim";
      return { token: "demo", snapshot: await this.request("snapshot") };
    }
    if (action === "snapshot") {
      const choirs = db.choirs.filter((c) => u.workspaceAdmin || C.membership(db, u.id, c.id));
      return { ...db, user: u, mustChange: false, choirs, users: db.users.filter((v) => v.id === u.id || choirs.some((c) => C.canRead(db, u, c.id, v.id))), memberships: db.memberships.filter((m) => choirs.some((c) => c.id === m.choirId) && C.canRead(db, u, m.choirId, m.userId)) };
    }
    if (action === "logout" || action === "changePin") return true;
    if (action === "workspaceSave") {
      C.requireValue(u.workspaceAdmin, "관리자 권한이 필요합니다.");
      Object.assign(db.workspace, p);
      this.save();
      return true;
    }
    if (action === "choirSave") {
      C.requireValue(u.workspaceAdmin, "관리자 권한이 필요합니다.");
      let c = db.choirs.find((c2) => c2.id === p.id);
      if (c) Object.assign(c, p);
      else {
        db.choirs.push(p);
        db.data[p.id] = { sessions: [], attendance: [], reasons: [], places: [], audit: [] };
      }
      this.save();
      return true;
    }
    if (action === "photoUpload") {
      u.photo = p.data;
      this.save();
      return true;
    }
    if (action === "photoGet") return db.users.find((v) => v.id === (p.userId || u.id))?.photo || null;
    if (action === "transferAdmin") {
      C.requireValue(u.workspaceAdmin, "권한이 없습니다.");
      db.users.find((v) => v.id === p.userId).workspaceAdmin = true;
      u.workspaceAdmin = false;
      this.save();
      return true;
    }
    if (["backup", "restore", "backups", "dataInfo"].includes(action)) throw new Error("백업·복원·Sheet 연결은 실제 Google 연결 후 사용할 수 있습니다.");
    C.requireValue(u.workspaceAdmin || C.membership(db, u.id, p.choirId), "접근 권한이 없습니다.");
    const d = db.data[p.choirId];
    if (action === "choirData") return { ...d, attendance: d.attendance.filter((v) => C.canRead(db, u, p.choirId, v.userId)), reasons: d.reasons.filter((v) => C.canRead(db, u, p.choirId, v.userId)) };
    if (action === "audit") {
      C.requireValue(C.has(db, u, p.choirId, ["admin"]), "권한이 없습니다.");
      return d.audit;
    }
    if (action === "memberSave") {
      C.requireValue(C.has(db, u, p.choirId, ["admin"]), "권한이 없습니다.");
      let v = db.users.find((v2) => v2.id === p.id);
      if (!v) db.users.push({ id: p.id, name: p.name, status: "active", workspaceAdmin: false });
      else v.name = p.name;
      db.memberships = db.memberships.filter((m) => !(m.userId === p.id && m.choirId === p.choirId));
      db.memberships.push({ id: p.choirId + ":" + p.id, userId: p.id, choirId: p.choirId, part: p.part, status: p.status, joinedAt: "2025-01-01T00:00:00Z", endedAt: p.status === "active" ? "" : (/* @__PURE__ */ new Date()).toISOString() });
      db.roles = db.roles.filter((r) => !(r.userId === p.id && r.choirId === p.choirId)).concat(p.roles.map((role) => ({ userId: p.id, choirId: p.choirId, role })));
    } else if (action === "sessionSave" || action === "placeSave") {
      C.requireValue(C.has(db, u, p.choirId, ["admin"]), "권한이 없습니다.");
      const name = action === "sessionSave" ? "sessions" : "places", v = action === "sessionSave" ? C.session(p) : p;
      d[name] = d[name].filter((s) => s.id !== p.id).concat(v);
    } else if (["checkin", "absence", "correct"].includes(action)) {
      const s = d.sessions.find((s2) => s2.id === p.sessionId);
      C.requireValue(s?.status === "active", "취소된 일정입니다.");
      const target = action === "correct" ? p.userId : u.id, id = s.id + ":" + target, old = d.attendance.find((v) => v.id === id);
      if (action === "correct") {
        C.requireValue(C.canCorrect(db, u, p.choirId, target), "정정 권한이 없습니다.");
        C.text(p.reason);
      } else {
        C.requireValue(C.membership(db, u.id, p.choirId), "활동 단원만 가능합니다.");
        C.requireValue(Date.now() <= Date.parse(s.close), "출석이 마감되었습니다.");
        if (action === "checkin") C.attendanceGate(s, d.places.find((v) => v.id === s.placeId), p.coords, Date.now());
      }
      if (action === "absence") {
        C.requireValue(old?.status !== "present", "이미 출석하셨습니다.");
        d.reasons = d.reasons.filter((v) => v.id !== id).concat({ id, sessionId: s.id, userId: u.id, reason: C.text(p.reason), resolved: false });
      } else {
        d.attendance = d.attendance.filter((v) => v.id !== id).concat({ id, sessionId: s.id, userId: target, status: action === "checkin" ? "present" : p.status, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), source: action });
        const reason = d.reasons.find((v) => v.id === id);
        if (reason) reason.resolved = action === "checkin" || p.status === "present";
      }
    } else throw new Error("지원하지 않는 요청입니다.");
    d.audit.push({ id: crypto.randomUUID(), at: (/* @__PURE__ */ new Date()).toISOString(), actor: u.id, action, target: p.id || p.sessionId || "", reason: p.reason && action === "correct" ? p.reason : "" });
    this.save();
    return true;
  }
}
