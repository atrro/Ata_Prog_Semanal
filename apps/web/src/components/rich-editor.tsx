"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Undo2 } from "lucide-react";
import { Button } from "./ui/button";

export function RichEditor({ value, onChange, readOnly = false }: { value: string; onChange: (value: string) => void; readOnly?: boolean }) {
  const editor = useEditor({ extensions: [StarterKit], content: value, immediatelyRender: false, editable: !readOnly, onUpdate: ({ editor: current }) => onChange(current.getHTML()), editorProps: { attributes: { class: "rich-content", "aria-label": "Conteúdo da seção" } } });
  return <div className="rich-editor">{!readOnly && <div className="editor-toolbar">
    <Button type="button" variant="ghost" size="icon" title="Negrito" aria-label="Negrito" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={15} /></Button>
    <Button type="button" variant="ghost" size="icon" title="Itálico" aria-label="Itálico" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={15} /></Button>
    <span className="toolbar-divider" />
    <Button type="button" variant="ghost" size="icon" title="Lista" aria-label="Lista" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></Button>
    <Button type="button" variant="ghost" size="icon" title="Lista numerada" aria-label="Lista numerada" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></Button>
    <Button type="button" variant="ghost" size="icon" title="Desfazer" aria-label="Desfazer" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></Button>
  </div>}<EditorContent editor={editor} /></div>;
}