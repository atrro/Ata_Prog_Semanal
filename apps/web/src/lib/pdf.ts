import { jsPDF } from "jspdf";
import { autoTable, type RowInput } from "jspdf-autotable";
import { checklistLabels, hasContent, type Minute, type Park } from "./domain";

const MARGIN = 18;
const CONTENT_WIDTH = 210 - MARGIN * 2;
const TOP = 24;
const BOTTOM_LIMIT = 273;

function cellText(element: Element) {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  return (copy.textContent ?? "").split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

function tableRows(table: HTMLTableElement): { head?: RowInput[]; body: RowInput[] } {
  const rows = Array.from(table.rows);
  const toRow = (row: HTMLTableRowElement): RowInput => Array.from(row.cells).map(cell => ({ content: cellText(cell), colSpan: cell.colSpan > 1 ? cell.colSpan : undefined }));
  const first = rows[0];
  const hasHead = !!first && first.cells.length > 0 && Array.from(first.cells).every(cell => cell.tagName === "TH");
  return hasHead ? { head: [toRow(first)], body: rows.slice(1).map(toRow) } : { body: rows.map(toRow) };
}

export function buildMinutePdf(minute: Minute, park: Park | undefined) {
  const pdf = new jsPDF();
  let position = TOP;
  const newPageIfNeeded = (height: number) => {
    if (position + height > BOTTOM_LIMIT) { pdf.addPage(); position = TOP; }
  };
  const text = (value: string, size = 10, bold = false, indent = 0) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(value, CONTENT_WIDTH - indent);
    for (const line of lines) {
      newPageIfNeeded(size * 0.48 + 1);
      pdf.text(line, MARGIN + indent, position);
      position += size * 0.48 + 1;
    }
    position += 4;
  };
  const image = (element: Element) => {
    const source = element.getAttribute("src") ?? "";
    const format = /^data:image\/(png|jpe?g);base64,/i.exec(source)?.[1];
    if (!format) return;
    try {
      const properties = pdf.getImageProperties(source);
      const scale = Math.min(1, CONTENT_WIDTH / (properties.width * 0.2646), (BOTTOM_LIMIT - TOP) / (properties.height * 0.2646));
      const width = properties.width * 0.2646 * scale;
      const height = properties.height * 0.2646 * scale;
      newPageIfNeeded(height);
      pdf.addImage(source, format.toLowerCase() === "png" ? "PNG" : "JPEG", MARGIN, position, width, height);
      position += height + 4;
    } catch { text("[Imagem não pôde ser incluída no PDF]", 9); }
  };
  const renderHtml = (html: string) => {
    const body = new DOMParser().parseFromString(html, "text/html").body;
    for (const node of Array.from(body.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (value) text(value);
        continue;
      }
      if (!(node instanceof HTMLElement)) continue;
      if (node.tagName === "IMG") { image(node); continue; }
      if (node.tagName === "TABLE") {
        const { head, body: rows } = tableRows(node as HTMLTableElement);
        autoTable(pdf, {
          head, body: rows, startY: position, margin: { top: TOP, left: MARGIN, right: MARGIN, bottom: 24 }, tableWidth: CONTENT_WIDTH,
          theme: "grid", styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak", textColor: [40, 50, 65], lineColor: [180, 190, 200], lineWidth: 0.2 },
          headStyles: { fillColor: [0, 90, 141], textColor: 255, fontStyle: "bold" }
        });
        position = ((pdf as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? position) + 6;
      } else if (node.tagName === "UL" || node.tagName === "OL") {
        Array.from(node.children).forEach((item, index) => {
          const marker = node.tagName === "OL" ? `${index + 1}. ` : "• ";
          text(`${marker}${(item.textContent ?? "").replace(/\s+/g, " ").trim()}`, 10, false, 4);
        });
      } else {
        const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (value) text(value, 10, node.tagName === "STRONG" || node.tagName === "B");
        node.querySelectorAll("img").forEach(image);
      }
    }
  };
  pdf.setTextColor(0, 90, 141);
  text("WIND PLANNER | Vestas Brasil", 19, true);
  pdf.setTextColor(40, 50, 65);
  text("ATA DE PROGRAMAÇÃO SEMANAL", 13, true);
  text(`${park?.name ?? "Parque"} | Semana ${minute.week} | ${minute.date}`);
  text(`Dispatcher: ${minute.dispatcher} | Versão: ${minute.version}`);
  text("Participantes", 12, true);
  text(minute.participants);
  minute.sections.filter(section => hasContent(section.content)).forEach(section => {
    text(section.title, 12, true);
    renderHtml(section.content);
  });
  text("Checklist", 12, true);
  checklistLabels.forEach(label => text(`${minute.checklist.includes(label) ? "[x]" : "[ ]"} ${label}`, 9));
  if (minute.links.length) { text("Links relacionados", 12, true); minute.links.forEach(link => text(`${link.title}: ${link.url}`)); }
  if (minute.attachments.length) { text("Anexos", 12, true); minute.attachments.forEach(file => text(`${file.name} - v${file.version}`)); }
  text(`Gerado em ${new Date().toLocaleString("pt-BR")} | Documento ${minute.id}`, 8);
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) { pdf.setPage(page); pdf.setFontSize(8); pdf.setTextColor(110); pdf.text(`Wind Planner - Uso interno | ${page}/${total}`, MARGIN, 288); }
  return pdf;
}

export function minutePdfFileName(minute: Minute, park: Park | undefined) {
  return `ATA-${park?.name ?? "parque"}-S${minute.week}-v${minute.version}.pdf`;
}

export async function exportPdf(minute: Minute, park: Park | undefined) {
  buildMinutePdf(minute, park).save(minutePdfFileName(minute, park));
}
