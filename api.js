import { Demo } from "./demo.js";
import { config } from "./config.js";
export const apiBase = (config.apiBase || (location.pathname.startsWith("/portal/") ? location.origin : "")).replace(/\/$/, "");
export class API {
  constructor() {
    this.demo = new Demo();
    this.isDemo = true;
    this.url = "";
    this.token = "";
  }
  connect(url) {
    if (!apiBase || !url.startsWith(apiBase + "/api/workspace/") || !/^[A-Za-z0-9_-]{2,32}$/.test(url.slice((apiBase + "/api/workspace/").length))) throw new Error("서비스 운영자의 Workspace 연결 주소를 확인해 주세요.");
    this.url = url;
    this.isDemo = false;
    this.token = "";
  }
  async request(action, payload = {}) {
    if (this.isDemo) return this.demo.request(action, payload);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 65e3);
    try {
      const r = await fetch(this.url, { method: "POST", redirect: "follow", credentials: "omit", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, payload, token: this.token }), signal: controller.signal });
      const result = await r.json();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    } catch (e) {
      if (e instanceof TypeError || e.name === "AbortError") throw new Error("서버에 연결하지 못했습니다. 연결·배포 권한을 확인한 뒤 새로고침하여 처리 결과를 확인해 주세요.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
