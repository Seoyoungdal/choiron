const KEY = "choiron-invitation-demo-v2";
const uuid = () => crypto.randomUUID().replaceAll("-", "");
export class PortalDemo {
  constructor() {
    try {
      this.db = JSON.parse(localStorage.getItem(KEY)) || { workspaces: [] };
    } catch {
      this.db = { workspaces: [] };
    }
  }
  save() {
    localStorage.setItem(KEY, JSON.stringify(this.db));
  }
  async request(path, p = {}) {
    try {
      this.db = JSON.parse(localStorage.getItem(KEY)) || this.db;
    } catch {
    }
    if (path === "/api/operator/workspaces") return this.db.workspaces;
    if (path === "/api/operator/invite") {
      if (this.db.workspaces.some((w3) => w3.code === p.code)) throw Error("이미 사용 중인 코드입니다.");
      const w2 = { id: uuid(), name: p.name, code: p.code, email: p.email, status: "invited", step: 0, token: uuid() + uuid(), expires: Date.now() + 6048e5, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      this.db.workspaces.push(w2);
      this.save();
      return { ...w2, url: new URL("./start.html", location.href).href + "?demo=1#invite=" + w2.token };
    }
    if (path === "/api/operator/action") {
      const w2 = this.db.workspaces.find((w3) => w3.id === p.id);
      if (p.action === "cancel") w2.status = "cancelled";
      if (p.action === "suspend") w2.status = "suspended";
      if (p.action === "resume") w2.status = w2.step === 6 ? "active" : w2.step ? "configuring" : "invited";
      if (p.action === "reissue") {
        w2.token = uuid() + uuid();
        w2.status = "invited";
        w2.expires = Date.now() + 6048e5;
      }
      this.save();
      return { ...w2, url: new URL("./start.html", location.href).href + "?demo=1#invite=" + w2.token };
    }
    if (path === "/api/invitations/inspect") {
      const w2 = this.db.workspaces.find((w3) => w3.token === p.token);
      if (!w2 || ["cancelled", "suspended"].includes(w2.status) || w2.expires < Date.now()) throw Error("초대가 만료되었거나 취소되었습니다.");
      this.current = w2.id;
      return w2;
    }
    if (path === "/api/me") return { role: document.body.dataset.portal === "operator" ? "operator" : "owner", email: "operator@example.org" };
    if (path === "/api/logout") {
      sessionStorage.removeItem("choiron-demo-owner");
      return true;
    }
    const id = this.current || sessionStorage.getItem("choiron-demo-owner"), w = this.db.workspaces.find((w2) => w2.id === id);
    if (path === "/api/oauth/start") {
      if (p.mode === "operator") return { url: new URL("./operator.html?demo=1", location.href).href };
      if (!w) throw Error("초대 링크를 열어 주세요.");
      w.step = Math.max(w.step, 1);
      w.status = "configuring";
      w.connected = true;
      sessionStorage.setItem("choiron-demo-owner", w.id);
      this.save();
      return { url: new URL("./start.html?demo=1", location.href).href };
    }
    if (!w) throw Object.assign(Error("초대 링크로 시작해 주세요."), { status: 401 });
    if (path === "/api/onboarding/status") return { ...w, memberUrl: new URL("./index.html?workspace=" + w.code, location.href).href, frontend: new URL("./index.html", location.href).href };
    const action = path.split("/").pop();
    if (action === "prepare") w.step = Math.max(w.step, 2);
    if (action === "account") {
      w.adminId = p.id;
      w.step = Math.max(w.step, 3);
    }
    if (action === "choir") {
      w.choirName = p.name;
      w.step = Math.max(w.step, 4);
    }
    if (action === "member") w.memberCount = (w.memberCount || 0) + 1;
    if (action === "schedule") w.step = Math.max(w.step, 5);
    if (action === "finish") {
      w.step = 6;
      w.status = "active";
      w.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    if (action === "login") return { demo: true };
    this.save();
    return true;
  }
}
