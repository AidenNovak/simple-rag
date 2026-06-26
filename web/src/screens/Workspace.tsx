import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.js";
import { ChatView } from "./Chat.js";
import { FileTree, type TreeNode } from "../components/FileTree.js";
import { NoteEditor, type SaveStatus } from "../components/NoteEditor.js";
import { DiffView } from "../components/DiffView.js";

interface Props {
  activeConvo: string | null;
  setActiveConvo: (id: string | null) => void;
  chatModel?: string | null;
  onConvoCreated: (id: string, title: string) => void;
  onModelChange?: (model: string) => void;
}

interface EditorState {
  docId: string;
  title: string;
  content: string;
  kind: "note" | "file";
}

/**
 * 工作台统一屏：左文件树 / 中编辑器 / 右对话。
 * 编排选区→对话、保存→重新摄入、对话改笔记→diff 的全部联动。
 */
export function WorkspaceScreen({ activeConvo, setActiveConvo, chatModel, onConvoCreated, onModelChange }: Props) {
  const toast = useToast();
  const [notes, setNotes] = useState<TreeNode[]>([]);
  const [files, setFiles] = useState<TreeNode[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [savedTitle, setSavedTitle] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [diff, setDiff] = useState<{ before: string; after: string; title: string } | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTree = useCallback(async () => {
    try {
      const r = await api.listDocs();
      const docs = (r.documents || []) as TreeNode[];
      setNotes(docs.filter((d) => d.kind === "note"));
      setFiles(docs.filter((d) => d.kind === "file"));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  const dirty = editor
    ? editor.content !== savedContent || editor.title !== savedTitle
    : false;

  const openNode = useCallback(async (node: TreeNode) => {
    if (node.kind !== "note" && node.kind !== "file") return;
    try {
      const r = await api.getDoc(node.id);
      const doc = r.document;
      setEditor({ docId: doc.id, title: doc.title, content: doc.contentMd || "", kind: doc.kind });
      setSavedTitle(doc.title);
      setSavedContent(doc.contentMd || "");
      setSaveStatus("saved");
      setSelection(null);
    } catch { toast("error", "打开失败"); }
  }, [toast]);

  const newNote = () => {
    setEditor({ docId: "", title: "", content: "", kind: "note" });
    setSavedTitle("");
    setSavedContent("");
    setSaveStatus("idle");
    setSelection(null);
  };

  const doSave = async () => {
    if (!editor || !editor.title.trim() || !editor.content.trim()) {
      toast("error", "标题和正文不能为空");
      return;
    }
    setSaving(true); setSaveStatus("saving");
    try {
      if (!editor.docId) {
        const r = await api.createNote(editor.title, editor.content);
        const docId = r.document.id;
        setEditor((e) => e ? { ...e, docId } : e);
        setSavedTitle(editor.title);
        setSavedContent(editor.content);
        setSaveStatus("saved");
        toast("success", "已保存并开始摄入知识库");
      } else {
        await api.updateNote(editor.docId, editor.title, editor.content);
        setSavedTitle(editor.title);
        setSavedContent(editor.content);
        setSaveStatus("saved");
        toast("success", "已更新，正在重新摄入…");
      }
      loadTree();
    } catch (e) {
      setSaveStatus("error");
      toast("error", `保存失败：${(e as Error).message}`);
    } finally { setSaving(false); }
  };

  // 自动保存（1.5s 防抖）：仅已存在的笔记（kind=note 且有 docId）+ dirty 时触发。文件只读不存。
  useEffect(() => {
    if (!editor || editor.kind !== "note" || !editor.docId || !dirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (editor.title.trim() && editor.content.trim()) doSave();
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [editor?.content, editor?.title]);

  const delNode = async (node: TreeNode) => {
    if (!confirm(`删除「${node.title}」？`)) return;
    try {
      await api.deleteDoc(node.id);
      toast("success", "已删除");
      if (editor?.docId === node.id) { setEditor(null); setSavedTitle(""); setSavedContent(""); }
      loadTree();
    } catch (e) { toast("error", `删除失败：${(e as Error).message}`); }
  };

  const upload = async (file: File) => {
    try {
      await api.upload(file);
      toast("success", "已上传，正在摄入…");
      loadTree();
    } catch (e) { toast("error", `上传失败：${(e as Error).message}`); }
  };

  // agent 通过 update_note 改了当前笔记 → 拉最新内容 + 出 diff
  const onNoteUpdated = useCallback(async (docId: string) => {
    if (!editor || editor.docId !== docId) return;
    try {
      const r = await api.getDoc(docId);
      const newContent = r.document.contentMd || "";
      setDiff({ before: editor.content, after: newContent, title: r.document.title });
      setEditor((e) => e ? { ...e, content: newContent } : e);
      setSavedContent(newContent);
      loadTree();
      toast("info", "AI 已更新当前笔记，请查看变更");
    } catch { toast("error", "刷新笔记失败"); }
  }, [editor, toast]);

  const acceptDiff = () => { setDiff(null); toast("success", "已采纳"); };

  return (
    <div className="workspace">
      <FileTree
        notes={notes}
        files={files}
        activeId={editor?.docId || null}
        onOpen={openNode}
        onNewNote={newNote}
        onDelete={delNode}
        onUpload={upload}
      />
      <div className="ws-editor-wrap">
        <NoteEditor
          docId={editor?.docId || null}
          title={editor?.title ?? ""}
          content={editor?.content || ""}
          kind={editor?.kind}
          dirty={dirty}
          saving={saving}
          saveStatus={saveStatus}
          onTitleChange={(t) => setEditor((e) => e ? { ...e, title: t } : e)}
          onContentChange={(c) => setEditor((e) => e ? { ...e, content: c } : e)}
          onSave={doSave}
          onSelectionChange={setSelection}
        />
        {diff && (
          <div className="ws-diff-overlay">
            <DiffView
              before={diff.before}
              after={diff.after}
              title={diff.title}
              onAccept={acceptDiff}
              onClose={() => setDiff(null)}
            />
          </div>
        )}
      </div>
      <div className="ws-chat">
        <ChatView
          activeConvo={activeConvo}
          chatModel={chatModel}
          onConvoCreated={onConvoCreated}
          onModelChange={onModelChange}
          contextDocId={editor?.kind === "note" && editor.docId ? editor.docId : null}
          selection={selection}
          onNoteUpdated={onNoteUpdated}
        />
      </div>
    </div>
  );
}
