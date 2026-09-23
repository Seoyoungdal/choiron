// Only public labels are persisted; credentials remain in this page's memory.
export class Workspaces {
  constructor(storage) {
    this.storage = storage;
    this.sessions = new Map();
    try { this.items = JSON.parse(storage.getItem('choiron-workspaces-v1') || '[]'); } catch { this.items = []; }
    if (!Array.isArray(this.items)) this.items = [];
    this.items = this.items.filter(x => x && typeof x.code === 'string' && /^[A-Za-z0-9_-]{2,32}$/.test(x.code) && typeof x.name === 'string').map(({code,name}) => ({code,name}));
  }
  remember(code, name, api) {
    this.items = this.items.filter(x => x.code !== code);
    this.items.push({code,name});
    this.sessions.set(code,api);
    this.save();
  }
  save() { try { this.storage.setItem('choiron-workspaces-v1',JSON.stringify(this.items)); } catch {} }
  forget(code) { this.sessions.delete(code); this.items = this.items.filter(x => x.code !== code); this.save(); }
  logout(code) { this.sessions.delete(code); }
}
