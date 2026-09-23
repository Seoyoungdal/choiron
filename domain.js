(function(root) {
  const roles = ["member", "leader", "secretary", "admin"];
  function fail(message) {
    throw new Error(message);
  }
  function requireValue(ok, message) {
    if (!ok) fail(message);
  }
  function userId(value) {
    requireValue(typeof value === "string" && /^[가-힣A-Za-z0-9_-]{1,64}$/.test(value), "로그인 ID는 한글·영문·숫자·밑줄·하이픈 1~64자이며 공백은 사용할 수 없습니다.");
    return value;
  }
  function id(value) {
    requireValue(typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value), "ID는 영문·숫자·_- 1~64자입니다.");
    return value;
  }
  function text(value, max = 200) {
    requireValue(typeof value === "string" && value.trim().length > 0 && value.length <= max, "입력 내용을 확인해 주세요.");
    return value.trim();
  }
  function pin(value) {
    requireValue(typeof value === "string" && /^\d{6,12}$/.test(value), "PIN은 숫자 6~12자리입니다.");
    return value;
  }
  function membership(db, uid, cid) {
    return db.memberships.find((m) => m.userId === uid && m.choirId === cid && m.status === "active");
  }
  function userRoles(db, uid, cid) {
    return db.roles.filter((r) => r.userId === uid && r.choirId === cid).map((r) => r.role);
  }
  function has(db, user, cid, allowed) {
    return user.workspaceAdmin === true || !!membership(db, user.id, cid) && userRoles(db, user.id, cid).some((r) => allowed.includes(r));
  }
  function canRead(db, user, cid, target) {
    if (user.workspaceAdmin === true) return true;
    const own = membership(db, user.id, cid);
    if (!own) return false;
    if (target === user.id || has(db, user, cid, ["admin", "secretary"])) return true;
    const other = db.memberships.find((m) => m.userId === target && m.choirId === cid);
    return userRoles(db, user.id, cid).includes("leader") && !!other && own.part === other.part;
  }
  function canCorrect(db, user, cid, target) {
    return has(db, user, cid, ["admin", "secretary", "leader"]) && canRead(db, user, cid, target);
  }
  function distance(a, b) {
    const rad = (x) => x * Math.PI / 180, dlat = rad(b.lat - a.lat), dlon = rad(b.lng - a.lng);
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlon / 2) ** 2;
    return 6371e3 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - Math.min(1, h)));
  }
  function location(p) {
    return p && typeof p.lat === "number" && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && typeof p.lng === "number" && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
  }
  function attendanceGate(session2, place, coords, now) {
    requireValue(session2 && session2.status === "active", "취소되었거나 없는 일정입니다.");
    requireValue(now >= Date.parse(session2.open) && now <= Date.parse(session2.close), "출석 가능 시간이 아닙니다.");
    requireValue(location(coords) && location(place), "위치를 확인할 수 없습니다. 위치 권한을 허용해 주세요.");
    requireValue(distance(coords, place) <= place.radius, "출석 장소의 허용 반경 밖입니다. 담당자에게 문의해 주세요.");
  }
  function session(value) {
    const s = { id: id(value.id), title: text(value.title, 100), placeId: id(value.placeId), start: value.start, end: value.end, open: value.open, close: value.close, status: value.status || "active" };
    requireValue(["active", "cancelled"].includes(s.status), "일정 상태가 잘못되었습니다.");
    for (const k of ["start", "end", "open", "close"]) {
      requireValue(typeof s[k] === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(s[k]) && Number.isFinite(Date.parse(s[k])), "시간대가 포함된 날짜가 필요합니다.");
      s[k] = new Date(s[k]).toISOString();
    }
    requireValue(Date.parse(s.start) < Date.parse(s.end) && Date.parse(s.open) <= Date.parse(s.close), "시작과 종료 시간을 확인해 주세요.");
    return s;
  }
  function expected(session2, member, now) {
    return session2.status === "active" && Date.parse(session2.close) < now && Date.parse(session2.start) >= Date.parse(member.joinedAt || "1970-01-01") && (!member.endedAt || Date.parse(session2.start) <= Date.parse(member.endedAt));
  }
  root.ChoirCore = { roles, fail, requireValue, id, userId, text, pin, membership, userRoles, has, canRead, canCorrect, distance, location, attendanceGate, session, expected };
})(globalThis);
