import "./domain.js";
export const reports = [{ id: "attendance", name: "단원별 출결 요약", columns: ["ID", "이름", "파트", "대상 일정", "출석", "결석", "인정결석", "출석률"], build({ sessions, attendance, memberships, users }, period) {
  return memberships.map((m) => {
    const ss = sessions.filter((s) => {
      const local = new Date(s.start);
      const key = local.getFullYear() + "-" + String(local.getMonth() + 1).padStart(2, "0");
      return key.slice(0, period.length) === period && globalThis.ChoirCore.expected(s, m, Date.now());
    });
    let present = 0, excused = 0;
    ss.forEach((s) => {
      const a = attendance.find((a2) => a2.sessionId === s.id && a2.userId === m.userId);
      if (a?.status === "present") present++;
      if (a?.status === "excused") excused++;
    });
    return [m.userId, users.find((u) => u.id === m.userId)?.name || m.userId, m.part, ss.length, present, ss.length - present - excused, excused, ss.length ? Math.round(present / ss.length * 100) + "%" : "—"];
  });
} }];
