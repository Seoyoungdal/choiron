// Only public labels are persisted; credentials remain in this page's memory.
export class Workspaces {
  constructor(storage) {
    this.storage = storage;
    this.sessions = new Map();
    try { this.items = JSON.parse(storage.getItem('choiron-free-workspaces-v1') || '[]'); } catch { this.items = []; }
    if (!Array.isArray(this.items)) this.items = [];
    this.items = this.items.filter(x => x && typeof x.code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x.code) && typeof x.name === 'string').filter(x => /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(x.url)).map(({code,name,url}) => ({code,name,url}));
  }
  remember(code, name, api) {
    this.items = this.items.filter(x => x.url !== api.url);
    this.items.push({code,name,url:api.url});
    this.sessions.set(api.url,api);
    this.save();
  }
  save() { try { this.storage.setItem('choiron-free-workspaces-v1',JSON.stringify(this.items)); } catch {} }
  forget(url) { this.sessions.delete(url); this.items = this.items.filter(x => x.url !== url); this.save(); }
  logout(url) { this.sessions.delete(url); }
}
