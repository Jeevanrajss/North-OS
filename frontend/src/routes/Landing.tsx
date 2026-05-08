import { useState } from 'react';

const GITHUB_URL = 'https://github.com/Jeevanrajss/Personal-OS';

const FEATURES = [
  { icon: '✦', title: 'Journaling & Reflection', desc: 'Capture thoughts, emotions, and experiences in a calm writing environment with AI-powered summaries and mood tracking.' },
  { icon: '◎', title: 'Habits & Routines', desc: 'Track positive habits, understand consistency over time, and discover patterns through streaks and intelligent insights.' },
  { icon: '◈', title: 'Financial Awareness', desc: 'Monitor spending, import bank statements automatically, track subscriptions, and receive AI-powered category insights.' },
  { icon: '◇', title: 'Personal Intelligence', desc: 'AI connects your emotional, behavioral, and financial data to reveal meaningful patterns across every area of life.' },
  { icon: '◉', title: 'Daily Briefings', desc: 'Receive personalized morning summaries based on your habits, journal, finances, and goals — generated privately on your device.' },
  { icon: '⬡', title: 'Unified Life Insights', desc: 'Understand how habits influence mood, how spending shifts during stress, and how routines shape your energy and focus.' },
];

const PHILOSOPHY = [
  { symbol: '01', title: 'Human First', desc: 'Technology should support human life, not control it.' },
  { symbol: '02', title: 'Clarity Over Noise', desc: 'The goal is not more information — it is deeper understanding.' },
  { symbol: '03', title: 'AI as Companion', desc: 'Intelligence that guides and assists while keeping you in control.' },
  { symbol: '04', title: 'Privacy by Design', desc: 'Your personal life belongs to you. Your data stays yours.' },
  { symbol: '05', title: 'Growth Through Reflection', desc: 'Understanding your patterns is the foundation for meaningful change.' },
];

const PROVIDERS = [
  { name: 'LM Studio', label: 'Local · Free' },
  { name: 'Ollama', label: 'Local · Free' },
  { name: 'OpenAI', label: 'GPT-4o' },
  { name: 'Anthropic', label: 'Claude' },
  { name: 'Gemini', label: 'Google' },
  { name: 'Groq', label: 'Fast inference' },
  { name: 'Mistral', label: 'Open weights' },
  { name: 'Custom', label: 'Any OpenAI-compat' },
];

const COMPAT = {
  os: [
    { icon: '🍎', name: 'macOS', detail: '12 Monterey or later · Apple Silicon & Intel' },
    { icon: '🪟', name: 'Windows', detail: 'Windows 10 / 11 (x64)' },
    { icon: '🐧', name: 'Linux', detail: 'Ubuntu 20.04+ · Debian · Arch · most x64 distros' },
  ],
  tiers: [
    {
      title: 'App only', subtitle: 'Use any cloud AI provider',
      color: 'rgba(107,124,230,0.12)', border: 'rgba(107,124,230,0.2)',
      specs: [
        { label: 'RAM', value: '4 GB' }, { label: 'Storage', value: '500 MB' },
        { label: 'Python', value: '3.11+' }, { label: 'Node.js', value: '18 LTS+' },
        { label: 'GPU', value: 'Not required' },
      ],
    },
    {
      title: 'Local AI', subtitle: 'Run models on your own machine',
      color: 'rgba(155,140,255,0.08)', border: 'rgba(155,140,255,0.25)',
      specs: [
        { label: 'RAM', value: '16 GB+' }, { label: 'Storage', value: '5–20 GB per model' },
        { label: 'Python', value: '3.11+' }, { label: 'Node.js', value: '18 LTS+' },
        { label: 'GPU', value: 'Optional — speeds up inference' },
      ],
      note: 'Apple Silicon (M-series) runs local AI extremely well via Metal. NVIDIA / AMD GPUs supported on Windows & Linux via CUDA / ROCm.',
    },
  ],
};

const INSTALL = {
  mac: {
    label: 'macOS & Linux',
    prereqs: [
      { name: 'Python 3.11+', url: 'https://python.org/downloads', hint: 'or: brew install python@3.12' },
      { name: 'Node.js 18+', url: 'https://nodejs.org', hint: 'or: brew install node' },
      { name: 'Git', url: 'https://git-scm.com', hint: 'usually pre-installed on macOS' },
    ],
    steps: [
      { label: 'Open Terminal and clone the repo', cmd: 'git clone https://github.com/Jeevanrajss/Personal-OS.git' },
      { label: 'Enter the folder', cmd: 'cd Personal-OS' },
      { label: 'Run the setup script — installs everything and launches the app', cmd: 'bash setup.sh' },
    ],
    note: 'The script installs all dependencies, starts the backend and frontend, and opens the app in your browser automatically.',
  },
  win: {
    label: 'Windows',
    prereqs: [
      { name: 'Python 3.11+', url: 'https://python.org/downloads', hint: 'check "Add Python to PATH" during install' },
      { name: 'Node.js 18+', url: 'https://nodejs.org', hint: 'download the LTS version' },
      { name: 'Git', url: 'https://git-scm.com', hint: 'git-scm.com — includes Git Bash' },
    ],
    steps: [
      { label: 'Open Command Prompt (or Git Bash) and clone the repo', cmd: 'git clone https://github.com/Jeevanrajss/Personal-OS.git' },
      { label: 'Enter the folder', cmd: 'cd Personal-OS' },
      { label: 'Run the setup script — installs everything and launches the app', cmd: 'setup.bat' },
    ],
    note: 'Windows may show an "Unknown Publisher" warning — this is normal for open-source scripts. Click Run to proceed.',
  },
};

/* ─── Copy button ─────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} style={{
      background: 'none', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
      fontSize: '11px', color: copied ? '#6b7ce6' : 'rgba(255,255,255,0.4)',
      transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}
      onMouseEnter={e => { if (!copied) e.currentTarget.style.borderColor = 'rgba(107,124,230,0.4)'; }}
      onMouseLeave={e => { if (!copied) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

/* ─── Email modal ─────────────────────────────────────────────────── */
function EmailModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');

  const invalid = touched && !email.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

  function goToGitHub() {
    window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
    setTimeout(() => window.location.reload(), 800);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!email.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return;
    setStatus('submitting');
    try {
      const body = new URLSearchParams({ 'form-name': 'north-os-download', email: email.trim() });
      await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    } catch { /* silent */ }
    setStatus('done');
    setTimeout(goToGitHub, 1000);
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
  };
  const card: React.CSSProperties = {
    width: '100%', maxWidth: '440px', borderRadius: '20px', padding: '40px',
    background: '#13131a', border: '1px solid rgba(107,124,230,0.3)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7)', position: 'relative',
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form name="north-os-download" data-netlify="true" hidden>
        <input type="email" name="email" />
      </form>
      <div style={card}>
        <button onClick={onClose} aria-label="Close" style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.3)', fontSize: '20px', lineHeight: 1, padding: '4px 8px', borderRadius: '6px',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>×</button>

        {status === 'done' ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🎉</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '10px', letterSpacing: '-0.02em' }}>You're in!</h3>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.65' }}>
              We'll keep you updated.<br />Taking you to the install page now…
            </p>
          </div>
        ) : (
          <>
            <img src="/favicon.png" alt="North OS" style={{ width: '44px', height: '44px', borderRadius: '12px', marginBottom: '20px' }} />
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '8px', letterSpacing: '-0.02em', lineHeight: '1.2' }}>
              One last step
            </h3>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.65', marginBottom: '28px' }}>
              Enter your email and we'll notify you when new features or updates land. No spam — only things worth knowing about.
            </p>
            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <input
                  type="email" placeholder="you@example.com" value={email} autoFocus
                  onChange={e => setEmail(e.target.value)} onBlur={() => setTouched(true)}
                  style={{
                    width: '100%', padding: '13px 16px', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${invalid ? '#f87171' : 'rgba(255,255,255,0.1)'}`,
                    color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => { if (!invalid) e.currentTarget.style.borderColor = 'rgba(107,124,230,0.55)'; }}
                  onBlurCapture={e => { if (!invalid) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
                {invalid && <p style={{ fontSize: '12px', color: '#f87171', marginTop: '6px', marginBottom: 0 }}>Please enter a valid email address.</p>}
              </div>
              <button type="submit" disabled={status === 'submitting'} style={{
                padding: '13px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #6b7ce6, #9b8cff)',
                border: 'none', color: 'white', fontWeight: '600', fontSize: '15px',
                cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
                opacity: status === 'submitting' ? 0.7 : 1, letterSpacing: '-0.01em',
              }}>
                {status === 'submitting' ? 'Just a moment…' : 'Notify me & Show Install Guide →'}
              </button>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: 0, marginTop: '4px' }}>
                No spam. Unsubscribe any time.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── CTA button ──────────────────────────────────────────────────── */
function GetStartedButton({ onClick, size = 'md', style = {} }: { onClick: () => void; size?: 'md' | 'lg'; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      padding: size === 'lg' ? '14px 32px' : '8px 18px',
      borderRadius: '10px',
      background: 'linear-gradient(135deg, #6b7ce6, #9b8cff)',
      border: 'none', color: 'white', fontWeight: '600',
      fontSize: size === 'lg' ? '16px' : '13px',
      cursor: 'pointer', letterSpacing: '-0.01em', ...style,
    }}>
      Get Started Free →
    </button>
  );
}

/* ─── Main landing ────────────────────────────────────────────────── */
export function Landing() {
  const [showModal, setShowModal] = useState(false);
  const [osTab, setOsTab] = useState<'mac' | 'win'>('mac');

  const install = INSTALL[osTab];

  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">

      {showModal && <EmailModal onClose={() => setShowModal(false)} />}

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{
          position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
          width: '900px', height: '600px',
          background: 'radial-gradient(ellipse at center, rgba(107,124,230,0.12) 0%, transparent 70%)',
        }} />
      </div>

      {/* ════ NAV ════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)', backgroundColor: 'rgba(10,10,15,0.8)',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/favicon.png" alt="North OS" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
            <span style={{ fontSize: '15px', fontWeight: '600', letterSpacing: '-0.01em' }}>North OS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
            {([['#features', 'Features'], ['#install', 'Install'], ['#compatibility', 'Requirements'], ['#ai-providers', 'AI']] as [string, string][]).map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
                {label}
              </a>
            ))}
            <GetStartedButton onClick={() => setShowModal(true)} style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '8px' }} />
          </div>
        </div>
      </nav>

      {/* ════ HERO ════ */}
      <section style={{ maxWidth: '800px', margin: '0 auto', padding: '160px 24px 100px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', marginBottom: '32px' }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 14px', borderRadius: '100px',
            border: '1px solid rgba(107,124,230,0.3)', background: 'rgba(107,124,230,0.08)',
            fontSize: '12px', color: 'rgba(155,140,255,0.9)', letterSpacing: '0.02em',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6b7ce6', display: 'inline-block' }} />
            Privacy-first · Open source · Local-first AI
          </span>
        </div>
        <h1 style={{ fontSize: 'clamp(42px, 7vw, 72px)', fontWeight: '700', lineHeight: '1.05', letterSpacing: '-0.03em', color: 'white', marginBottom: '16px' }}>
          Your life has patterns.
        </h1>
        <h1 style={{
          fontSize: 'clamp(42px, 7vw, 72px)', fontWeight: '700', lineHeight: '1.05',
          letterSpacing: '-0.03em', marginBottom: '28px',
          background: 'linear-gradient(135deg, #6b7ce6 0%, #9b8cff 50%, #c084fc 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          North OS helps you understand them.
        </h1>
        <p style={{ fontSize: '18px', lineHeight: '1.65', color: 'rgba(255,255,255,0.45)', maxWidth: '540px', margin: '0 auto 48px', letterSpacing: '-0.01em' }}>
          A private, AI-powered personal operating system that brings your journal, habits, finances, and routines into one calm, connected experience.
        </p>
        <GetStartedButton onClick={() => setShowModal(true)} size="lg" />
        <p style={{ marginTop: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
          Runs 100% on your machine · No account required · MIT License
        </p>
      </section>

      {/* ════ FEATURES ════ */}
      <section id="features" style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '12px' }}>What it does</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: '700', letterSpacing: '-0.02em', color: 'white' }}>
            Everything that matters. Nothing that doesn't.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ padding: '28px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(107,124,230,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(107,124,230,0.12)', border: '1px solid rgba(107,124,230,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#9b8cff' }}>{f.icon}</div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'white', marginBottom: '8px', letterSpacing: '-0.01em' }}>{f.title}</h3>
              <p style={{ fontSize: '14px', lineHeight: '1.65', color: 'rgba(255,255,255,0.4)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════ INSTALL GUIDE ════ */}
      <section id="install" style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '12px' }}>Installation</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: '700', letterSpacing: '-0.02em', color: 'white', marginBottom: '12px' }}>
            Up and running in minutes.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)', maxWidth: '480px', margin: '0 auto' }}>
            One command sets up everything. No Docker, no cloud accounts, no configuration required.
          </p>
        </div>

        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          {/* OS tab switcher */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
            {(['mac', 'win'] as const).map(tab => (
              <button key={tab} onClick={() => setOsTab(tab)} style={{
                padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500',
                border: osTab === tab ? '1px solid rgba(107,124,230,0.5)' : '1px solid rgba(255,255,255,0.08)',
                background: osTab === tab ? 'rgba(107,124,230,0.15)' : 'rgba(255,255,255,0.03)',
                color: osTab === tab ? '#9b8cff' : 'rgba(255,255,255,0.45)',
                transition: 'all 0.15s',
              }}>
                {tab === 'mac' ? '🍎 macOS & Linux' : '🪟 Windows'}
              </button>
            ))}
          </div>

          {/* Step 1 — Prerequisites */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(107,124,230,0.2)', border: '1px solid rgba(107,124,230,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#9b8cff', flexShrink: 0 }}>1</div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'white', letterSpacing: '-0.01em', margin: 0 }}>Install prerequisites</h3>
            </div>
            <div style={{ marginLeft: '40px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {install.prereqs.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', fontWeight: '500', color: '#9b8cff', textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                      {p.name} ↗
                    </a>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{p.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Steps 2–4 — Commands */}
          {install.steps.map((step, i) => (
            <div key={i} style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(107,124,230,0.2)', border: '1px solid rgba(107,124,230,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#9b8cff', flexShrink: 0 }}>{i + 2}</div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'white', letterSpacing: '-0.01em', margin: 0 }}>{step.label}</h3>
              </div>
              <div style={{ marginLeft: '40px', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '10px', background: '#0d0d14', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ color: 'rgba(107,124,230,0.6)', fontSize: '13px', fontFamily: 'monospace', flexShrink: 0 }}>$</span>
                <code style={{ fontSize: '13px', fontFamily: 'monospace', color: 'rgba(220,220,255,0.9)', flex: 1, wordBreak: 'break-all' }}>{step.cmd}</code>
                <CopyButton text={step.cmd} />
              </div>
            </div>
          ))}

          {/* Note */}
          <div style={{ marginLeft: '40px', marginTop: '8px', padding: '14px 16px', borderRadius: '10px', background: 'rgba(107,124,230,0.07)', border: '1px solid rgba(107,124,230,0.15)' }}>
            <p style={{ fontSize: '13px', color: 'rgba(155,140,255,0.7)', lineHeight: '1.6', margin: 0 }}>
              ✓ &nbsp;{install.note}
            </p>
          </div>

          {/* Final step */}
          <div style={{ marginTop: '20px', marginLeft: '40px', padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>🌐</span>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: '1.6' }}>
              The browser opens automatically at <span style={{ color: 'white', fontFamily: 'monospace' }}>http://localhost:5173</span>. Your app is ready.
            </p>
          </div>
        </div>
      </section>

      {/* ════ PRIVACY ════ */}
      <section id="privacy" style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ borderRadius: '20px', padding: '64px', border: '1px solid rgba(107,124,230,0.2)', background: 'linear-gradient(135deg, rgba(107,124,230,0.06) 0%, rgba(10,10,15,0) 60%)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(107,124,230,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ maxWidth: '560px' }}>
            <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '16px' }}>Privacy First</p>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: '700', letterSpacing: '-0.02em', lineHeight: '1.15', marginBottom: '20px', color: 'white' }}>
              Your data belongs to you.<br />Full stop.
            </h2>
            <p style={{ fontSize: '16px', lineHeight: '1.7', color: 'rgba(255,255,255,0.45)', marginBottom: '32px' }}>
              North OS runs locally on your own device. Your personal thoughts, emotions, routines, and finances never leave your machine. No tracking. No telemetry. No cloud dependency unless you choose it.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {['Runs entirely on your machine', 'No accounts, no sign-up required', 'Zero telemetry or analytics', 'Open source — inspect every line'].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
                  <span style={{ color: '#6b7ce6', fontSize: '16px' }}>✓</span>{item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════ SYSTEM REQUIREMENTS ════ */}
      <section id="compatibility" style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '12px' }}>System requirements</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: '700', letterSpacing: '-0.02em', color: 'white', marginBottom: '12px' }}>Runs on your hardware.</h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)', maxWidth: '500px', margin: '0 auto' }}>
            The app itself is lightweight. Local AI adds higher requirements — but you can always start with a cloud provider and switch later.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {COMPAT.os.map((os, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 24px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: '28px', lineHeight: 1 }}>{os.icon}</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'white', marginBottom: '3px' }}>{os.name}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: '1.4' }}>{os.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
          {COMPAT.tiers.map((tier, ti) => (
            <div key={ti} style={{ borderRadius: '16px', padding: '32px', border: `1px solid ${tier.border}`, background: tier.color }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'white', marginBottom: '4px', letterSpacing: '-0.01em' }}>{tier.title}</h3>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>{tier.subtitle}</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {tier.specs.map((spec, si) => (
                  <div key={si} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: si < tier.specs.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{spec.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.8)' }}>{spec.value}</span>
                  </div>
                ))}
              </div>
              {tier.note && (
                <div style={{ marginTop: '20px', padding: '14px 16px', borderRadius: '10px', background: 'rgba(107,124,230,0.08)', border: '1px solid rgba(107,124,230,0.15)' }}>
                  <p style={{ fontSize: '12px', color: 'rgba(155,140,255,0.75)', lineHeight: '1.6', margin: 0 }}>💡 {tier.note}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════ PHILOSOPHY ════ */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '12px' }}>Core philosophy</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: '700', letterSpacing: '-0.02em', color: 'white' }}>Built on five principles.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '2px', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
          {PHILOSOPHY.map((p, i) => (
            <div key={i} style={{ padding: '32px 24px', background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.025)', borderRight: i < PHILOSOPHY.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em', color: 'rgba(107,124,230,0.6)', marginBottom: '16px', fontFamily: 'monospace' }}>{p.symbol}</div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'white', marginBottom: '10px', letterSpacing: '-0.01em' }}>{p.title}</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'rgba(255,255,255,0.35)' }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════ AI PROVIDERS ════ */}
      <section id="ai-providers" style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '12px' }}>AI providers</p>
          <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: '700', letterSpacing: '-0.02em', color: 'white', marginBottom: '12px' }}>Your AI. Your choice.</h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)', maxWidth: '480px', margin: '0 auto' }}>
            Use a free local model for full privacy, or connect any cloud provider. Switch any time from the Settings page.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
          {PROVIDERS.map((p, i) => (
            <div key={i} style={{ padding: '10px 20px', borderRadius: '100px', border: '1px solid rgba(107,124,230,0.25)', background: 'rgba(107,124,230,0.07)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.75)' }}>{p.name}</span>
              <span style={{ fontSize: '11px', color: 'rgba(107,124,230,0.5)' }}>·</span>
              <span style={{ fontSize: '11px', color: 'rgba(155,140,255,0.55)' }}>{p.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ════ FINAL CTA ════ */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px 120px' }}>
        <div style={{ textAlign: 'center', padding: '80px 40px', borderRadius: '20px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '600px', height: '400px', background: 'radial-gradient(ellipse, rgba(107,124,230,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '20px' }}>Get started</p>
          <h2 style={{ fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.1', color: 'white', marginBottom: '20px' }}>Start understanding yourself.</h2>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.4)', maxWidth: '440px', margin: '0 auto 40px', lineHeight: '1.65' }}>
            Free, open source, and runs entirely on your machine.
          </p>
          <GetStartedButton onClick={() => setShowModal(true)} size="lg" />
        </div>
      </section>

      {/* ════ FOOTER ════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '32px 24px', maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/favicon.png" alt="North OS" style={{ width: '24px', height: '24px', borderRadius: '6px' }} />
          <span style={{ fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.5)' }}>North OS</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>MIT License</span>
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
          {[['#features', 'Features'], ['#install', 'Install'], ['#compatibility', 'Requirements']].map(([href, label]) => (
            <a key={href} href={href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
              {label}
            </a>
          ))}
        </div>
      </footer>

    </div>
  );
}
