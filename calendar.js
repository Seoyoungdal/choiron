const stamp = (value) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const escape = (value) => String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
function fold(line) {
  let out = "", part = "";
  for (const c of line) {
    if (new TextEncoder().encode(part + c).length > 73) {
      out += part + "\r\n ";
      part = "";
    }
    part += c;
  }
  return out + part;
}
export function ics(s, workspace, choir, place) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ChoirON//Calendar v1//KO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${workspace.id}-${choir.id}-${s.id}@choiron`, `DTSTAMP:${stamp(/* @__PURE__ */ new Date())}`, `DTSTART:${stamp(s.start)}`, `DTEND:${stamp(s.end)}`, `SUMMARY:${escape(s.title)}`, `DESCRIPTION:${escape(choir.name + " · " + workspace.name)}`, `LOCATION:${escape(place || "")}`, `STATUS:${s.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
export function googleCalendar(s, choir, place) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: s.title, dates: stamp(s.start) + "/" + stamp(s.end), details: choir.name, location: place || "" });
  return "https://calendar.google.com/calendar/render?" + q;
}
export function download(data, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3e3);
}
