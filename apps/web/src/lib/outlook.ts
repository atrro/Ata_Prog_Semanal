import type { Minute, Park } from "./domain";
import { weekLabel } from "./domain";
import { buildMinuteBody, buildMinuteHtml, minuteHtmlFileName } from "./minute-html";
import { buildMinutePdfWithLogo, minutePdfFileName } from "./pdf";
import { loadLogo } from "./vestas";

type DraftInput = { minute: Minute; park: Park | undefined; to?: string[] };

export const minuteSubject = (minute: Minute, park: Park | undefined) => `ATA DE PROGRAMAÇÃO SEMANAL - ${park?.name ?? "Parque"} - ${weekLabel(minute)}`;

export function downloadFile(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
const wrap = (base64: string) => base64.replace(/(.{76})/g, "$1\r\n");

function encodeWord(value: string) {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const characters = Array.from(value);
  const words: string[] = [];
  for (let index = 0; index < characters.length; index += 10) words.push(`=?UTF-8?B?${toBase64(new TextEncoder().encode(characters.slice(index, index + 10).join("")))}?=`);
  return words.join("\r\n ");
}
const quoted = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/["\\]/g, "'").replace(/[^\x20-\x7e]/g, "_");

async function minutePdfBytes(minute: Minute, park: Park | undefined) {
  const pdf = await buildMinutePdfWithLogo(minute, park);
  return new Uint8Array(pdf.output("arraybuffer"));
}

// Imagens em data URI não aparecem no Outlook; viram partes inline referenciadas por Content-ID.
function extractInlineImages(html: string) {
  const images = new Map<string, { cid: string; mime: string; base64: string }>();
  const replaced = html.replace(/src="data:(image\/[a-z0-9.+-]+);base64,([^"]+)"/gi, (_match, mime: string, base64: string) => {
    const key = `${mime}:${base64}`;
    if (!images.has(key)) images.set(key, { cid: `img${images.size + 1}@windplanner`, mime, base64 });
    return `src="cid:${images.get(key)!.cid}"`;
  });
  return { html: replaced, images: [...images.values()] };
}

export async function buildOutlookDraft({ minute, park, to = [] }: DraftInput) {
  const logo = await loadLogo();
  const { html, images } = extractInlineImages(await buildMinuteHtml(minute, park, logo?.data));
  const mixed = `----=_mixed_${crypto.randomUUID().replace(/-/g, "")}`;
  const related = `----=_related_${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();
  const parts: string[] = [
    "X-Unsent: 1",
    ...(to.length ? [`To: ${to.join(", ")}`] : []),
    `Subject: ${encodeWord(minuteSubject(minute, park))}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/related; type="text/html"; boundary="${related}"`,
    "",
    `--${related}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(toBase64(encoder.encode(html)))
  ];
  images.forEach((image, index) => {
    const name = `imagem${index + 1}.${image.mime.split("/")[1].replace("jpeg", "jpg").replace(/\+.*/, "")}`;
    parts.push(`--${related}`, `Content-Type: ${image.mime}; name="${name}"`, "Content-Transfer-Encoding: base64", `Content-ID: <${image.cid}>`, `Content-Disposition: inline; filename="${name}"`, "", wrap(image.base64));
  });
  parts.push(`--${related}--`);
  const attach = (name: string, type: string, base64: string) => parts.push(`--${mixed}`, `Content-Type: ${type}; name="${quoted(name)}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${quoted(name)}"`, "", wrap(base64));
  attach(minutePdfFileName(minute, park), "application/pdf", toBase64(await minutePdfBytes(minute, park)));
  for (const file of minute.attachments) {
    const bytes = new Uint8Array(await (await fetch(file.data)).arrayBuffer());
    attach(file.name, file.type || "application/octet-stream", toBase64(bytes));
  }
  parts.push(`--${mixed}--`, "");
  return new Blob([parts.join("\r\n")], { type: "message/rfc822" });
}

// O Outlook abre o .eml com X-Unsent como um novo e-mail pronto para envio.
export async function openOutlookDraft(input: DraftInput) {
  const file = await buildOutlookDraft(input);
  downloadFile(file, `ATA-${input.park?.name ?? "parque"}-${weekLabel(input.minute)}.eml`);
}

async function copyHtml(html: string) {
  const plain = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  if (navigator.clipboard && "ClipboardItem" in window) {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) })]);
    return;
  }
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.style.cssText = "position:fixed;left:-9999px;top:0";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  const copied = document.execCommand("copy");
  selection?.removeAllRanges();
  holder.remove();
  if (!copied) throw new Error("clipboard");
}

export async function copyMinuteForEmail(minute: Minute, park: Park | undefined) {
  const logo = await loadLogo();
  await copyHtml(await buildMinuteBody(minute, park, logo?.data));
}

export async function exportMinuteHtml(minute: Minute, park: Park | undefined) {
  const logo = await loadLogo();
  downloadFile(new Blob([await buildMinuteHtml(minute, park, logo?.data)], { type: "text/html;charset=utf-8" }), minuteHtmlFileName(minute, park));
}

// Outlook na web não aceita anexos nem corpo HTML por link: copia o corpo, baixa os arquivos e abre o rascunho.
export async function openOutlookWeb({ minute, park, to = [] }: DraftInput) {
  await copyMinuteForEmail(minute, park);
  downloadFile(new Blob([await minutePdfBytes(minute, park)], { type: "application/pdf" }), minutePdfFileName(minute, park));
  for (const file of minute.attachments) downloadFile(await (await fetch(file.data)).blob(), file.name);
  const query = [`to=${encodeURIComponent(to.join(","))}`, `subject=${encodeURIComponent(minuteSubject(minute, park))}`].join("&");
  window.open(`https://outlook.office.com/mail/deeplink/compose?${query}`, "_blank", "noopener");
}
