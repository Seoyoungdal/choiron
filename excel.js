import { download } from "./calendar.js";
let ready;
async function library() {
  if (!ready) ready = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "./vendor/exceljs.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Excel 라이브러리를 불러오지 못했습니다."));
    document.head.append(s);
  });
  await ready;
  return window.ExcelJS;
}
export async function exportExcel(columns, rows, name) {
  const E = await library(), book = new E.Workbook(), sheet = book.addWorksheet("ChoirON");
  sheet.addRow(columns);
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2458D3" } };
  sheet.columns.forEach((c) => c.width = 22);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  download(await book.xlsx.writeBuffer(), name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
export async function importExcel(file) {
  if (file.size > 2e6) throw new Error("Excel 파일은 2MB 이하여야 합니다.");
  const E = await library(), b = new E.Workbook();
  await b.xlsx.load(await file.arrayBuffer());
  const s = b.worksheets[0], out = [];
  if (!s || s.rowCount > 201) throw new Error("한 번에 최대 200명까지 등록할 수 있습니다.");
  const expected = ["ID", "이름", "파트", "권한", "상태", "초기PIN"];
  if (expected.some((v, i) => s.getRow(1).getCell(i + 1).text !== v)) throw new Error("단원 양식의 열 순서를 유지해 주세요.");
  s.eachRow((r, i) => {
    if (i > 1) {
      const values = expected.map((_, j) => r.getCell(j + 1));
      if (values.some((c) => c.type === 6)) throw new Error("수식이 포함된 셀은 허용하지 않습니다.");
      out.push({ id: values[0].text.trim(), name: values[1].text.trim(), part: values[2].text.trim(), roles: values[3].text.split(",").map((x) => x.trim()), status: values[4].text.trim() || "active", pin: values[5].text.trim() });
    }
  });
  return out;
}
