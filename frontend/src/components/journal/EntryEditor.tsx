import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Loader2, Save } from 'lucide-react';
import type { Entry } from '@/lib/api';

type Props = {
  /** Optional existing entry — undefined when composing a brand-new one. */
  entry?: Entry;
  /** Called with (content_json, content_text) whenever the user saves. */
  onSave: (content_json: string, content_text: string) => Promise<void> | void;
  /** Mark as dirty but don't auto-save — caller decides save cadence. */
  autoFocus?: boolean;
};

const DEFAULT_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

function parseInitial(content_json: string | undefined) {
  if (!content_json) return DEFAULT_DOC;
  try {
    const parsed = JSON.parse(content_json);
    // Guard against legacy/empty shapes.
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed;
    return DEFAULT_DOC;
  } catch {
    return DEFAULT_DOC;
  }
}

export function EntryEditor({ entry, onSave, autoFocus }: Props) {
  const initialDoc = useMemo(() => parseInitial(entry?.content_json), [entry?.id]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef<string>(entry?.content_json ?? JSON.stringify(DEFAULT_DOC));

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // We keep the default node set. Headings levels 1-3 are plenty.
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: 'Start writing…  (try # for heading, - for bullet, > for quote)',
          emptyEditorClass:
            'before:content-[attr(data-placeholder)] before:text-ink-400 before:float-left before:h-0 before:pointer-events-none',
        }),
      ],
      content: initialDoc,
      autofocus: autoFocus ? 'end' : false,
      editorProps: {
        attributes: {
          class:
            'prose prose-invert max-w-none min-h-[120px] focus:outline-none text-sm leading-relaxed',
        },
      },
      onUpdate: () => setDirty(true),
    },
    // Re-create the editor when we swap to a different entry id.
    [entry?.id],
  );

  // Keyboard save: ⌘/Ctrl+S
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  async function doSave() {
    if (!editor || saving) return;
    const json = JSON.stringify(editor.getJSON());
    const text = editor.getText();
    if (json === lastSavedRef.current) {
      setDirty(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(json, text);
      lastSavedRef.current = json;
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface)]">
      <div className="px-3 py-2.5">
        <EditorContent editor={editor} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
        <div className="text-xs text-ink-400">
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
        </div>
        <button
          type="button"
          onClick={doSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1 text-xs text-accent hover:bg-accent/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
      </div>
    </div>
  );
}
