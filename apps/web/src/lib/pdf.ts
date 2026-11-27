import { jsPDF } from "jspdf";
import { autoTable, type RowInput } from "jspdf-autotable";
import { checklistLabels, formatDateBr, hasContent, weekLabel, type Minute, type Park } from "./domain";
import { loadLogo, VESTAS_BLUE_RGB, type Logo } from "./vestas";

type Color = [number, number, number];
const BLUE = VESTAS_BLUE_RGB;
const DARK: Color = [28, 40, 56];
const MUTED: Color = [102, 116, 135];
const LIGHT: Color = [240, 245, 250];
const LINE: Color = [201, 211, 222];
const PAGE_WIDTH = 210;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TOP = 26;
const BOTTOM_LIMIT = 276;
const PX_TO_MM = 0.2646;
const IMAGE_FORMAT = /^data:image\/(png|jpe?g);base64,/i;

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

export function buildMinutePdf(minute: Minute, park: Park | undefined, logo?: Logo) {
  const pdf = new jsPDF();
  const title = `${park?.name ?? "Parque"} | ${weekLabel(minute)}`;
  let position = TOP;

  const newPageIfNeeded = (height: number) => {
    if (position + height > BOTTOM_LIMIT) { pdf.addPage(); position = TOP; }
  };
  const text = (value: string, size = 10, bold = false, indent = 0, color: Color = DARK) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines: string[] = pdf.splitTextToSize(value, CONTENT_WIDTH - indent);
    for (const line of lines) {
      newPageIfNeeded(size * 0.48 + 1);
      pdf.text(line, MARGIN + indent, position);
      position += size * 0.48 + 1;
    }
    position += 3;
  };
  const heading = (value: string) => {
    newPageIfNeeded(24);
    pdf.setFillColor(...BLUE);
    pdf.rect(MARGIN, position, CONTENT_WIDTH, 7, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(value.toUpperCase(), MARGIN + 3, position + 4.8);
    position += 11;
  };
  const image = (element: Element) => {
    const source = element.getAttribute("src") ?? "";
    const format = IMAGE_FORMAT.exec(source)?.[1];
    if (!format) return;
    try {
      const properties = pdf.getImageProperties(source);
      const scale = Math.min(1, (CONTENT_WIDTH - 2) / (properties.width * PX_TO_MM), (BOTTOM_LIMIT - TOP - 4) / (properties.height * PX_TO_MM));
      const width = properties.width * PX_TO_MM * scale;
      const height = properties.height * PX_TO_MM * scale;
      newPageIfNeeded(height + 2);
      pdf.addImage(source, format.toLowerCase() === "png" ? "PNG" : "JPEG", MARGIN + 1, position, width, height);
      pdf.setDrawColor(...LINE);
      pdf.setLineWidth(0.2);
      pdf.rect(MARGIN + 1, position, width, height);
      position += height + 5;
    } catch { text("[Imagem não pôde ser incluída no PDF]", 9, false, 0, MUTED); }
  };
  const table = (head: RowInput[] | undefined, body: RowInput[], extra: Record<string, unknown> = {}) => {
    autoTable(pdf, {
      head, body, startY: position, margin: { top: TOP, left: MARGIN, right: MARGIN, bottom: 20 }, tableWidth: CONTENT_WIDTH,
      theme: "grid", styles: { fontSize: 9, cellPadding: 2.2, overflow: "linebreak", textColor: DARK, lineColor: LINE, lineWidth: 0.2 },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [250, 252, 254] }, ...extra
    });
    position = ((pdf as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? position) + 6;
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
        table(head, rows);
        node.querySelectorAll("img").forEach(image);
      } else if (node.tagName === "UL" || node.tagName === "OL") {
        Array.from(node.children).forEach((item, index) => {
          const marker = node.tagName === "OL" ? `${index + 1}. ` : "• ";
          text(`${marker}${(item.textContent ?? "").replace(/\s+/g, " ").trim()}`, 10, false, 4);
          item.querySelectorAll("img").forEach(image);
        });
      } else {
        const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (value) text(value, 10, /^(STRONG|B|H[1-6])$/.test(node.tagName));
        node.querySelectorAll("img").forEach(image);
      }
    }
  };
  const wordmark = (x: number, y: number, width: number) => {
    if (logo) pdf.addImage(logo.data, "PNG", x, y, width, width * logo.height / logo.width);
    else { pdf.setFont("helvetica", "bolditalic"); pdf.setFontSize(width * 0.6); pdf.setTextColor(...BLUE); pdf.text("Vestas", x, y + width * 0.2); }
  };
  const checkbox = (x: number, y: number, done: boolean) => {
    pdf.setLineWidth(0.35);
    if (done) {
      pdf.setFillColor(...BLUE); pdf.setDrawColor(...BLUE); pdf.rect(x, y, 3.6, 3.6, "FD");
      pdf.setDrawColor(255, 255, 255); pdf.setLineWidth(0.55);
      pdf.line(x + 0.8, y + 1.9, x + 1.55, y + 2.7); pdf.line(x + 1.55, y + 2.7, x + 2.9, y + 0.9);
    } else { pdf.setDrawColor(...LINE); pdf.rect(x, y, 3.6, 3.6, "S"); }
  };

  wordmark(MARGIN, 9, 40);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(...BLUE);
  pdf.text("ATA DE PROGRAMAÇÃO SEMANAL", PAGE_WIDTH - MARGIN, 14, { align: "right" });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(...MUTED);
  pdf.text("Wind Planner | Vestas Brasil | Service Operations", PAGE_WIDTH - MARGIN, 19.5, { align: "right" });
  pdf.setFillColor(...BLUE); pdf.rect(MARGIN, 24.5, CONTENT_WIDTH, 1.2, "F");
  position = 38;
  text(park?.name ?? "Parque", 21, true, 0, DARK);
  position -= 1;
  text(`Programação ${weekLabel(minute)} | Reunião em ${formatDateBr(minute.date)}`, 11, false, 0, MUTED);
  position += 1;

  const cards: [string, string][] = [
    ["Parque", `${park?.name ?? "-"}${park?.state ? ` (${park.state})` : ""}`],
    ["Semana", weekLabel(minute)],
    ["Data da reunião", formatDateBr(minute.date)],
    ["Dispatcher", minute.dispatcher],
    ["Turbina / Aerogeradores", park ? `${park.turbineType} | ${park.turbines}` : "-"],
    ["Versão / Status", `v${minute.version} | ${minute.status}`]
  ];
  const gap = 3;
  const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;
  cards.forEach(([label, value], index) => {
    const x = MARGIN + (index % 3) * (cardWidth + gap);
    const y = position + Math.floor(index / 3) * 17;
    pdf.setFillColor(...LIGHT); pdf.rect(x, y, cardWidth, 14.5, "F");
    pdf.setFillColor(...BLUE); pdf.rect(x, y, 1, 14.5, "F");
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(...MUTED);
    pdf.text(label.toUpperCase(), x + 4, y + 4.8);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...DARK);
    const [first] = pdf.splitTextToSize(value || "-", cardWidth - 6) as string[];
    pdf.text(first ?? "-", x + 4, y + 10.8);
  });
  position += 17 * 2 + 4;

  heading("Participantes");
  const participantRows: RowInput[] = minute.participants.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const separator = line.indexOf(":");
    return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim() || "-"] : [{ content: line, colSpan: 2 }];
  });
  table(undefined, participantRows, { columnStyles: { 0: { cellWidth: 48, fontStyle: "bold", fillColor: LIGHT, textColor: BLUE } } });

  minute.sections.filter(section => hasContent(section.content)).forEach(section => {
    heading(section.title);
    renderHtml(section.content);
    position += 2;
  });

  heading("Checklist de verificação");
  const columnWidth = CONTENT_WIDTH / 2;
  const done = minute.checklist.length;
  for (let index = 0; index < checklistLabels.length; index += 2) {
    newPageIfNeeded(9);
    [checklistLabels[index], checklistLabels[index + 1]].forEach((label, column) => {
      if (!label) return;
      const x = MARGIN + column * columnWidth;
      checkbox(x, position - 3, minute.checklist.includes(label));
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...DARK);
      pdf.text(label, x + 6, position);
    });
    position += 7;
  }
  text(`${done} de ${checklistLabels.length} itens revisados`, 8.5, true, 0, done === checklistLabels.length ? BLUE : MUTED);

  if (minute.links.length) {
    heading("Links relacionados");
    table([["Título", "Endereço"]], minute.links.map(link => [link.title, link.url]));
  }
  if (minute.attachments.length) {
    heading("Anexos");
    table([["Arquivo", "Tipo", "Tamanho", "Versão"]], minute.attachments.map(file => [file.name, file.type || "-", `${Math.max(1, Math.round(file.size / 1024))} KB`, `v${file.version}`]));
    minute.attachments.filter(file => IMAGE_FORMAT.test(file.data)).forEach(file => {
      text(file.name, 8.5, true, 0, MUTED);
      const holder = document.createElement("img");
      holder.setAttribute("src", file.data);
      image(holder);
    });
  }
  text(`Gerado em ${new Date().toLocaleString("pt-BR")} | Documento ${minute.id}`, 8, false, 0, MUTED);

  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page);
    if (page > 1) {
      wordmark(MARGIN, 8.5, 22);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...MUTED);
      pdf.text(title, PAGE_WIDTH - MARGIN, 13, { align: "right" });
      pdf.setFillColor(...BLUE); pdf.rect(MARGIN, 17.5, CONTENT_WIDTH, 0.7, "F");
    }
    pdf.setDrawColor(...LINE); pdf.setLineWidth(0.3); pdf.line(MARGIN, 284, PAGE_WIDTH - MARGIN, 284);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...MUTED);
    pdf.text("Vestas Brasil | Wind Planner | Uso interno", MARGIN, 289);
    pdf.text(`Página ${page} de ${total}`, PAGE_WIDTH - MARGIN, 289, { align: "right" });
  }
  return pdf;
}

export function minutePdfFileName(minute: Minute, park: Park | undefined) {
  return `ATA-${park?.name ?? "parque"}-${weekLabel(minute)}-v${minute.version}.pdf`;
}

export async function buildMinutePdfWithLogo(minute: Minute, park: Park | undefined) {
  return buildMinutePdf(minute, park, await loadLogo());
}

export async function exportPdf(minute: Minute, park: Park | undefined) {
  (await buildMinutePdfWithLogo(minute, park)).save(minutePdfFileName(minute, park));
}
