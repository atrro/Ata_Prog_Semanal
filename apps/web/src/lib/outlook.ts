import type { Attachment, Minute, Park } from "./domain";
import { buildMinutePdf, minutePdfFileName } from "./pdf";

type DraftInput = { minute: Minute; park: Park | undefined; to: string[]; subject: string; body: string };

function dataUrlToFile(attachment: Attachment) {
  const [header, base64 = ""] = attachment.data.split(",");
  const type = header.match(/^data:([^;]+)/)?.[1] ?? attachment.type;
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  return new File([bytes], attachment.name, { type });
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openOutlookDraft({ minute, park, to, subject, body }: DraftInput): Promise<"shared" | "compose"> {
  const pdf = new File([buildMinutePdf(minute, park).output("blob")], minutePdfFileName(minute, park), { type: "application/pdf" });
  const files = [pdf, ...minute.attachments.map(dataUrlToFile)];
  if (navigator.canShare?.({ files })) {
    await navigator.share({ files, title: subject, text: body });
    return "shared";
  }
  files.forEach(download);
  const query = [`to=${encodeURIComponent(to.join(","))}`, `subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`].join("&");
  window.open(`https://outlook.office.com/mail/deeplink/compose?${query}`, "_blank", "noopener");
  return "compose";
}
