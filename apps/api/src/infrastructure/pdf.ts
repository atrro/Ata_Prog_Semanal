import PDFDocument from "pdfkit";
import { checklist, type MinuteRecord } from "../domain/minute";

export function generatePdf(minute: MinuteRecord, parkName: string, attachments: { name: string; version: number }[] = []): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 45, bufferPages: true, info: { Title: `Ata ${parkName} - S${minute.week}`, Author: minute.dispatcher } });
    const chunks: Buffer[] = [];
    pdf.on("data", chunk => chunks.push(chunk)); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject);
    pdf.fillColor("#005A8D").font("Helvetica-Bold").fontSize(23).text("Wind Planner");
    pdf.fontSize(9).fillColor("#7890A0").text("Vestas Brasil | One Standard. One Process. One Voice.").moveDown();
    const heading = (value: string) => { pdf.moveDown(.8).fillColor("#005A8D").font("Helvetica-Bold").fontSize(12).text(value).moveDown(.4); pdf.fillColor("#283746").font("Helvetica").fontSize(10); };
    heading("ATA DE PROGRAMAÇÃO SEMANAL");
    pdf.text(`${parkName} | Semana ${minute.week} | ${minute.data.date}`).text(`Dispatcher: ${minute.dispatcher} | Território: ${minute.data.territory} | Versão: ${minute.version}`);
    heading("Participantes"); pdf.text(minute.data.participants);
    heading("Checklist de planejamento"); checklist.forEach(item => pdf.text(`${minute.data.checklist.includes(item) ? "[x]" : "[ ]"} ${item}`));
    for (const section of minute.data.sections) { const content = section.content.replace(/<\/(p|li|h[1-6])>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&"); if (content.trim()) { heading(section.title); pdf.text(content); } }
    if (minute.data.links.length) { heading("Links relacionados"); minute.data.links.forEach(link => { pdf.fillColor("#008DC4").text(link.title, { link: link.url, underline: true }); pdf.fillColor("#283746").fontSize(8).text(link.url).fontSize(10); }); }
    if (attachments.length) { heading("Anexos relacionados"); attachments.forEach(file => pdf.text(`${file.name} - v${file.version}`)); }
    heading("Registro"); pdf.fontSize(8).text(`Documento: ${minute.id}\nGerado em: ${new Date().toISOString()}`);
    pdf.end();
  });
}