import { useState } from 'react';
import type { Entry } from '@/lib/api';
import { EntryEditor } from './EntryEditor';
import { Plus, Trash2 } from 'lucide-react';
import { formatLocalTime } from '@/lib/date';

type Props = {
  entries: Entry[];
  onCreate: (content_json: string, content_text: string) => Promise<void>;
  onUpdate: (entryId: string, content_json: string, content_text: string) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
};

function formatTime(iso: string): string {
  return formatLocalTime(iso, 'h:mm a');
}

export function EntryList({ entries, onCreate, onUpdate, onDelete }: Props) {
  const [composing, setComposing] = useState(false);

  async function handleCreate(json: string, text: string) {
    await onCreate(json, text);
    setComposing(false);
  }

  return (
    <div className="space-y-4">
      {entries.length === 0 && !composing && (
        <div className="text-sm text-ink-600">No entries yet for this day.</div>
      )}

      {entries.map((e) => (
        <div key={e.id} className="space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span className="font-mono">{formatTime(e.created_at)}</span>
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this entry?')) void onDelete(e.id);
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-500 hover:text-red-400 hover:bg-red-950/30"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
          <EntryEditor
            entry={e}
            onSave={(json, text) => onUpdate(e.id, json, text)}
          />
        </div>
      ))}

      {composing && (
        <div className="space-y-2">
          <div className="text-xs text-ink-500">New entry</div>
          <EntryEditor autoFocus onSave={handleCreate} />
          <button
            type="button"
            onClick={() => setComposing(false)}
            className="text-xs text-ink-500 hover:text-ink-100"
          >
            Cancel
          </button>
        </div>
      )}

      {!composing && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-ink-800 px-3 py-2 text-sm text-ink-400 hover:border-accent/50 hover:text-accent"
        >
          <Plus className="w-4 h-4" /> Add entry
        </button>
      )}
    </div>
  );
}
