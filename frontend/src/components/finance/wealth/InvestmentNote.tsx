/** Persistent banner — always visible in My Wealth tab. Non-negotiable per architectural decision. */
export function InvestmentNote() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', borderRadius: 10,
      background: 'rgba(255,184,107,0.07)', border: '1px solid rgba(255,184,107,0.20)',
      fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.5,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>📌</span>
      <span>
        <b style={{ color: 'var(--accent-yellow)' }}>Amounts shown are what you've put in</b>, not current market value.
        Check your brokerage app or AMC portal for NAV-based returns.
      </span>
    </div>
  );
}
