/**
 * Renders **markdown bold** (`**text**`) as <strong> elements.
 * Used across all AI output cards so key items pop on a quick glance.
 */
import React from 'react';

export function renderBold(text: string): React.ReactNode {
  // Split on **…** — odd indices are the captured bold spans
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text; // fast-path: no bold markers
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: 'var(--fg-1)', fontWeight: 600 }}>{part}</strong>
      : part,
  );
}
