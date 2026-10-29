import { jsPDF } from "jspdf";
import { checklistLabels, type Minute, type Park, stripHtml } from "./domain";

export async function exportPdf(minute: Minute, park: Park | undefined) {
  const pdf = new jsPDF();
  let position = 24;
  const text = (value: string, size = 10, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(value, 174);
    for (const line of lines) {
      if (position > 273) { pdf.addPage(); position = 24; }
      pdf.text(line, 18, position);
      position += size * 0.48 + 1;
    }
    position += 4;
  };
  pdf.setTextColor(0, 90, 141);
  text("WIND PLANNER | Vestas Brasil", 19, true);
  pdf.setTextColor(40, 50, 65);
  text("ATA DE PROGRAMAÇÃO SEMANAL", 13, true);
  text(`${park?.name ?? "Parque"} | Semana ${minute.week} | ${minute.date}`);
  text(`Dispatcher: ${minute.dispatcher} | Território: ${minute.territory} | Versão: ${minute.version}`);
  text("Participantes", 12, true);
  text(minute.participants);
  text("Checklist", 12, true);
  checklistLabels.forEach(label => text(`${minute.checklist.includes(label) ? "[x]" : "[ ]"} ${label}`, 9));
  minute.sections.filter(section => stripHtml(section.content)).forEach(section => { text(section.title, 12, true); text(stripHtml(section.content)); });
  if (minute.links.length) { text("Links relacionados", 12, true); minute.links.forEach(link => { text(`${link.title}: ${link.url}`); }); }
  if (minute.attachments.length) { text("Anexos", 12, true); minute.attachments.forEach(file => text(`${file.name} - v${file.version}`)); }
  text(`Gerado em ${new Date().toLocaleString("pt-BR")} | Documento ${minute.id}`, 8);
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) { pdf.setPage(page); pdf.setFontSize(8); pdf.setTextColor(110); pdf.text(`Wind Planner - Uso interno | ${page}/${total}`, 18, 288); }
  pdf.save(`ATA-${park?.name ?? "parque"}-S${minute.week}-v${minute.version}.pdf`);
}