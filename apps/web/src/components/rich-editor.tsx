"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Bold, Italic, List, ListOrdered, Table as TableIcon, Undo2 } from "lucide-react";
import { Button } from "./ui/button";

const MAX_IMAGE_SIDE = 1600;
const MAX_IMAGE_CHARS = 2_000_000;

async function imageToDataUrl(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const png = canvas.toDataURL("image/png");
  if (png.length <= MAX_IMAGE_CHARS / 2) return { src: png, width: canvas.width, height: canvas.height };
  // JPEG não tem transparência; o fundo branco evita áreas pretas.
  const flat = document.createElement("canvas");
  flat.width = canvas.width; flat.height = canvas.height;
  const flatContext = flat.getContext("2d");
  if (!flatContext) throw new Error("canvas");
  flatContext.fillStyle = "#fff"; flatContext.fillRect(0, 0, flat.width, flat.height); flatContext.drawImage(canvas, 0, 0);
  for (const quality of [0.85, 0.7, 0.5]) {
    const jpeg = flat.toDataURL("image/jpeg", quality);
    if (jpeg.length <= MAX_IMAGE_CHARS) return { src: jpeg, width: flat.width, height: flat.height };
  }
  throw new Error("size");
}

export function RichEditor({ value, onChange, readOnly = false }: { value: string; onChange: (value: string) => void; readOnly?: boolean }) {
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = (message: string) => { setNotice(message); if (noticeTimer.current) clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(""), 6000); };
  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ allowBase64: true }), Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
    content: value, immediatelyRender: false, editable: !readOnly, onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editorProps: {
      attributes: { class: "rich-content", "aria-label": "Conteúdo da seção" },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        void (async () => {
          for (const file of files) {
            try {
              const { src, width, height } = await imageToDataUrl(file);
              view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src, width, height, alt: "Imagem colada" })).scrollIntoView());
            } catch (failure) {
              showNotice(failure instanceof Error && failure.message === "size" ? "A imagem é grande demais, mesmo comprimida. Use uma imagem menor." : "Não foi possível colar a imagem.");
            }
          }
        })();
        return true;
      }
    }
  });
  return <div className="rich-editor">{!readOnly && <div className="editor-toolbar">
    <Button type="button" variant="ghost" size="icon" title="Negrito" aria-label="Negrito" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={15} /></Button>
    <Button type="button" variant="ghost" size="icon" title="Itálico" aria-label="Itálico" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={15} /></Button>
    <span className="toolbar-divider" />
    <Button type="button" variant="ghost" size="icon" title="Lista" aria-label="Lista" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></Button>
    <Button type="button" variant="ghost" size="icon" title="Lista numerada" aria-label="Lista numerada" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></Button>
    <Button type="button" variant="ghost" size="icon" title="Inserir tabela 3x3" aria-label="Inserir tabela" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={16} /></Button>
    <Button type="button" variant="ghost" size="icon" title="Desfazer" aria-label="Desfazer" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></Button>
  </div>}<EditorContent editor={editor} />{notice && <p className="field-error" role="alert">{notice}</p>}</div>;
}