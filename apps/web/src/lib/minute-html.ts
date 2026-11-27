import { checklistLabels, formatDateBr, hasContent, safeUrl, weekLabel, type Minute, type Park } from "./domain";
import { VESTAS_BLUE } from "./vestas";

const MAX_IMAGE_WIDTH = 640;
const FONT = "Segoe UI,Calibri,Arial,sans-serif";
const BORDER = "#c9d3de";

export const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function measure(source: string) {
  return new Promise<{ width: number; height: number }>(resolve => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: MAX_IMAGE_WIDTH, height: 0 });
    image.src = source;
  });
}

const fitWidth = (width: number) => Math.min(width || MAX_IMAGE_WIDTH, MAX_IMAGE_WIDTH);

const elementStyles: Record<string, string> = {
  p: "margin:0 0 8px 0;line-height:1.5",
  ul: "margin:0 0 8px 0;padding-left:22px",
  ol: "margin:0 0 8px 0;padding-left:22px",
  li: "margin:0 0 3px 0;line-height:1.5",
  h1: `margin:10px 0 6px 0;font-size:16px;color:${VESTAS_BLUE}`,
  h2: `margin:10px 0 6px 0;font-size:15px;color:${VESTAS_BLUE}`,
  h3: `margin:8px 0 6px 0;font-size:14px;color:${VESTAS_BLUE}`,
  blockquote: `margin:0 0 8px 0;padding-left:10px;border-left:3px solid ${BORDER};color:#51627a`,
  table: "border-collapse:collapse;width:100%;margin:8px 0",
  th: `border:1px solid ${BORDER};padding:6px 8px;background:${VESTAS_BLUE};color:#ffffff;text-align:left;font-weight:bold;vertical-align:top`,
  td: `border:1px solid ${BORDER};padding:6px 8px;text-align:left;vertical-align:top`
};

// O HTML do editor vira marcação com estilos inline, a única forma que o Outlook preserva ao colar.
export function styleContent(html: string) {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  body.querySelectorAll("script,style,iframe,object,embed,link,meta,colgroup").forEach(element => element.remove());
  body.querySelectorAll("*").forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      if (attribute.name.startsWith("on") || (attribute.name === "href" && !safeUrl(attribute.value))) element.removeAttribute(attribute.name);
    });
    const tag = element.tagName.toLowerCase();
    if (tag === "img") {
      if (!/^data:image\//i.test(element.getAttribute("src") ?? "")) { element.remove(); return; }
      const width = Number(element.getAttribute("width")) || 0;
      if (width) element.setAttribute("width", String(fitWidth(width)));
      element.setAttribute("style", `display:block;max-width:100%;height:auto;margin:8px 0;border:1px solid ${BORDER}`);
      element.removeAttribute("height");
      return;
    }
    if (tag === "table") element.setAttribute("width", "100%");
    if (tag === "a") { element.setAttribute("target", "_blank"); element.setAttribute("style", `color:${VESTAS_BLUE}`); }
    if (elementStyles[tag]) element.setAttribute("style", elementStyles[tag]);
  });
  return body.innerHTML;
}

const label = (value: string) => `<div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#667487">${escapeHtml(value)}</div>`;

function sectionHeading(title: string) {
  return `<tr><td style="padding:22px 0 8px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="background:${VESTAS_BLUE};color:#ffffff;padding:8px 12px;font-size:13px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;font-family:${FONT}">${escapeHtml(title)}</td></tr></table></td></tr>`;
}

function infoCell(name: string, value: string) {
  return `<td width="33%" valign="top" style="background:#f0f5fa;border-left:4px solid ${VESTAS_BLUE};padding:9px 12px">${label(name)}<div style="font-size:14px;font-weight:bold;color:#1c2838;margin-top:3px">${escapeHtml(value || "-")}</div></td>`;
}

export async function buildMinuteBody(minute: Minute, park: Park | undefined, logo?: string) {
  const header = `<tr><td style="padding:0 0 14px 0;border-bottom:3px solid ${VESTAS_BLUE}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td valign="middle">${logo ? `<img src="${logo}" alt="Vestas" width="150" style="display:block;border:0;height:auto">` : `<span style="font-size:30px;font-weight:bold;font-style:italic;color:${VESTAS_BLUE}">Vestas</span>`}</td><td valign="middle" align="right" style="font-family:${FONT}"><div style="font-size:16px;font-weight:bold;color:${VESTAS_BLUE}">ATA DE PROGRAMAÇÃO SEMANAL</div><div style="font-size:12px;color:#667487;margin-top:3px">Wind Planner · Vestas Brasil · Service Operations</div></td></tr></table></td></tr>`;
  const titleBlock = `<tr><td style="padding:18px 0 12px 0"><div style="font-size:26px;font-weight:bold;color:#1c2838">${escapeHtml(park?.name ?? "Parque")}</div><div style="font-size:14px;color:#667487;margin-top:4px">Programação ${escapeHtml(weekLabel(minute))} · Reunião em ${escapeHtml(formatDateBr(minute.date))}</div></td></tr>`;
  const cards = `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;margin:-6px"><tr>${infoCell("Parque", `${park?.name ?? "-"}${park?.state ? ` (${park.state})` : ""}`)}${infoCell("Semana", weekLabel(minute))}${infoCell("Data da reunião", formatDateBr(minute.date))}</tr><tr>${infoCell("Dispatcher", minute.dispatcher)}${infoCell("Turbina / Aerogeradores", park ? `${park.turbineType} · ${park.turbines}` : "-")}${infoCell("Versão / Status", `v${minute.version} · ${minute.status}`)}</tr></table></td></tr>`;

  const participantRows = minute.participants.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const separator = line.indexOf(":");
    return separator > 0
      ? `<tr><td width="30%" style="border:1px solid ${BORDER};background:#f0f5fa;color:${VESTAS_BLUE};font-weight:bold;padding:7px 10px">${escapeHtml(line.slice(0, separator).trim())}</td><td style="border:1px solid ${BORDER};padding:7px 10px">${escapeHtml(line.slice(separator + 1).trim() || "-")}</td></tr>`
      : `<tr><td colspan="2" style="border:1px solid ${BORDER};padding:7px 10px">${escapeHtml(line)}</td></tr>`;
  }).join("");
  const participants = `${sectionHeading("Participantes")}<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">${participantRows}</table></td></tr>`;

  const sections = minute.sections.filter(section => hasContent(section.content)).map(section => `${sectionHeading(section.title)}<tr><td style="font-size:13px;color:#1c2838;line-height:1.5">${styleContent(section.content)}</td></tr>`).join("");

  const checklistCell = (item?: string) => item
    ? `<td width="50%" style="padding:5px 4px;font-size:13px"><span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border:1px solid ${minute.checklist.includes(item) ? VESTAS_BLUE : BORDER};background:${minute.checklist.includes(item) ? VESTAS_BLUE : "#ffffff"};color:#ffffff;font-size:12px;font-weight:bold;margin-right:8px">${minute.checklist.includes(item) ? "&#10003;" : "&nbsp;"}</span>${escapeHtml(item)}</td>`
    : `<td width="50%"></td>`;
  const checklistRows = checklistLabels.filter((_, index) => index % 2 === 0).map((item, index) => `<tr>${checklistCell(item)}${checklistCell(checklistLabels[index * 2 + 1])}</tr>`).join("");
  const checklist = `${sectionHeading("Checklist de verificação")}<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${checklistRows}</table><div style="font-size:12px;font-weight:bold;color:${VESTAS_BLUE};margin-top:6px">${minute.checklist.length} de ${checklistLabels.length} itens revisados</div></td></tr>`;

  const links = minute.links.length
    ? `${sectionHeading("Links relacionados")}<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">${minute.links.map(link => { const url = safeUrl(link.url); return `<tr><td style="border:1px solid ${BORDER};padding:7px 10px"><strong>${escapeHtml(link.title)}</strong><br>${url ? `<a href="${escapeHtml(url)}" style="color:${VESTAS_BLUE}">${escapeHtml(url)}</a>` : escapeHtml(link.url)}</td></tr>`; }).join("")}</table></td></tr>`
    : "";

  let attachments = "";
  if (minute.attachments.length) {
    const files = await Promise.all(minute.attachments.map(async file => {
      const isImage = /^data:image\//i.test(file.data);
      const size = isImage ? await measure(file.data) : { width: 0, height: 0 };
      const picture = isImage ? `<br><img src="${file.data}" alt="${escapeHtml(file.name)}" ${size.width ? `width="${fitWidth(size.width)}"` : ""} style="display:block;max-width:100%;height:auto;margin:8px 0 0 0;border:1px solid ${BORDER}">` : "";
      return `<tr><td style="border:1px solid ${BORDER};padding:8px 10px;font-size:13px"><strong>${escapeHtml(file.name)}</strong> <span style="color:#667487">· v${file.version} · ${Math.max(1, Math.round(file.size / 1024))} KB</span>${picture}</td></tr>`;
    }));
    attachments = `${sectionHeading("Anexos")}<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${files.join("")}</table></td></tr>`;
  }

  const footer = `<tr><td style="padding:22px 0 0 0;border-top:1px solid ${BORDER};font-size:11px;color:#667487">Vestas Brasil · Wind Planner · Uso interno<br>Gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))} · Documento ${escapeHtml(minute.id)}</td></tr>`;

  return `<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:680px;max-width:100%;font-family:${FONT};color:#1c2838;background:#ffffff">${header}${titleBlock}${cards}${participants}${sections}${checklist}${links}${attachments}${footer}</table>`;
}

export async function buildMinuteHtml(minute: Minute, park: Park | undefined, logo?: string) {
  const body = await buildMinuteBody(minute, park, logo);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ata ${escapeHtml(park?.name ?? "")} ${escapeHtml(weekLabel(minute))}</title></head><body style="margin:0;padding:24px;background:#eef2f6;font-family:${FONT}"><div style="background:#ffffff;width:680px;max-width:100%;margin:0 auto;padding:24px">${body}</div></body></html>`;
}

export function minuteHtmlFileName(minute: Minute, park: Park | undefined) {
  return `ATA-${park?.name ?? "parque"}-${weekLabel(minute)}-v${minute.version}.html`;
}
