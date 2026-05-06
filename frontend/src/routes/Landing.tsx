import { useState } from 'react';

const DOWNLOAD_URL = 'https://github.com/Jeevanrajss/Personal-OS/archive/refs/heads/main.zip';

const FEATURES = [
  {
    icon: '✦',
    title: 'Journaling & Reflection',
    desc: 'Capture thoughts, emotions, and experiences in a calm writing environment with AI-powered summaries and mood tracking.',
  },
  {
    icon: '◎',
    title: 'Habits & Routines',
    desc: 'Track positive habits, understand consistency over time, and discover patterns through streaks and intelligent insights.',
  },
  {
    icon: '◈',
    title: 'Financial Awareness',
    desc: 'Monitor spending, import bank statements automatically, track subscriptions, and receive AI-powered category insights.',
  },
  {
    icon: '◇',
    title: 'Personal Intelligence',
    desc: 'AI connects your emotional, behavioral, and financial data to reveal meaningful patterns across every area of life.',
  },
  {
    icon: '◉',
    title: 'Daily Briefings',
    desc: 'Receive personalized morning summaries based on your habits, journal, finances, and goals — generated privately on your device.',
  },
  {
    icon: '⬡',
    title: 'Unified Life Insights',
    desc: 'Understand how habits influence mood, how spending shifts during stress, and how routines shape your energy and focus.',
  },
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
      title: 'App only',
      subtitle: 'Use any cloud AI provider',
      color: 'rgba(107,124,230,0.12)',
      border: 'rgba(107,124,230,0.2)',
      specs: [
        { label: 'RAM', value: '4 GB' },
        { label: 'Storage', value: '500 MB' },
        { label: 'Python', value: '3.11+' },
        { label: 'Node.js', value: '18 LTS+' },
        { label: 'GPU', value: 'Not required' },
      ],
    },
    {
      title: 'Local AI',
      subtitle: 'Run models on your own machine',
      color: 'rgba(155,140,255,0.08)',
      border: 'rgba(155,140,255,0.25)',
      specs: [
        { label: 'RAM', value: '16 GB+' },
        { label: 'Storage', value: '5–20 GB per model' },
        { label: 'Python', value: '3.11+' },
        { label: 'Node.js', value: '18 LTS+' },
        { label: 'GPU', value: 'Optional — speeds up inference' },
      ],
      note: 'Apple Silicon (M-series) runs local AI extremely well via Metal. NVIDIA / AMD GPUs supported on Windows & Linux via CUDA / ROCm.',
    },
  ],
};

/* ─── Email capture modal — mandatory, no skip ────────────────────── */
function EmailModal() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');

  const invalid = touched && !email.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

  function triggerDownload() {
    const a = document.createElement('a');
    a.href = DOWNLOAD_URL;
    a.download = 'north-os.zip';
    a.click();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!email.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return;

    setStatus('submitting');
    try {
      const body = new URLSearchParams({
        'form-name': 'north-os-download',
        email: email.trim(),
      });
      await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    } catch { /* silent — still download */ }

    setStatus('done');
    setTimeout(triggerDownload, 600);
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '24px',
  };
  const card: React.CSSProperties = {
    width: '100%', maxWidth: '440px',
    borderRadius: '20px', padding: '40px',
    background: '#13131a',
    border: '1px solid rgba(107,124,230,0.3)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
  };

  return (
    /* Intentionally no onClick on overlay — modal is mandatory */
    <div style={overlay}>
      {/* Netlify bot detection — hidden form required */}
      <form name="north-os-download" data-netlify="true" hidden>
        <input type="email" name="email" />
      </form>

      <div style={card}>
        {status === 'done' ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🎉</div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '10px', letterSpacing: '-0.02em' }}>
              You're in!
            </h3>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.65' }}>
              We'll notify you when North OS updates.<br />Your download is starting…
            </p>
          </div>
        ) : (
          <>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px', marginBottom: '20px',
              background: 'linear-gradient(135deg, #6b7ce6, #9b8cff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', fontWeight: '700', color: 'white',
            }}>N</div>

            <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '8px', letterSpacing: '-0.02em', lineHeight: '1.2' }}>
              One last step
            </h3>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.65', marginBottom: '28px' }}>
              Enter your email and we'll notify you when new features or updates land. No spam — only things worth knowing about.
            </p>

            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (touched) setTouched(true); }}
                  onBlur={() => setTouched(true)}
                  autoFocus
                  style={{
                    width: '100%', padding: '13px 16px', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${invalid ? '#f87171' : 'rgba(255,255,255,0.1)'}`,
                    color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { if (!invalid) e.currentTarget.style.borderColor = 'rgba(107,124,230,0.55)'; }}
                  onBlurCapture={e => { if (!invalid) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
                {invalid && (
                  <p style={{ fontSize: '12px', color: '#f87171', marginTop: '6px', marginBottom: 0 }}>
                    Please enter a valid email address.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={status === 'submitting'}
                style={{
                  padding: '13px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6b7ce6, #9b8cff)',
                  border: 'none', color: 'white', fontWeight: '600', fontSize: '15px',
                  cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
                  opacity: status === 'submitting' ? 0.7 : 1,
                  letterSpacing: '-0.01em',
                }}
              >
                {status === 'submitting' ? 'Just a moment…' : 'Notify me & Download →'}
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

/* ─── Download button (reusable) ──────────────────────────────────── */
function DownloadButton({
  onDownload, style = {}, size = 'md',
}: {
  onDownload: () => void;
  style?: React.CSSProperties;
  size?: 'md' | 'lg';
}) {
  const pad = size === 'lg' ? '13px 32px' : '8px 18px';
  const fs = size === 'lg' ? '15px' : '13px';
  return (
    <button
      onClick={onDownload}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: pad, borderRadius: '10px',
        background: 'linear-gradient(135deg, #6b7ce6, #9b8cff)',
        border: 'none', color: 'white', fontWeight: '600', fontSize: fs,
        cursor: 'pointer', letterSpacing: '-0.01em',
        ...style,
      }}
    >
      ↓ Download Free
    </button>
  );
}

/* ─── Main landing page ───────────────────────────────────────────── */
export function Landing() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">

      {showModal && <EmailModal />}

      {/* ── Ambient glow ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{
          position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
          width: '900px', height: '600px',
          background: 'radial-gradient(ellipse at center, rgba(107,124,230,0.12) 0%, transparent 70%)',
        }} />
      </div>

      {/* ════════════════════════════════════════
          NAV
      ════════════════════════════════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        backgroundColor: 'rgba(10,10,15,0.8)',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #6b7ce6, #9b8cff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', fontWeight: '700', color: 'white',
            }}>N</div>
            <span style={{ fontSize: '15px', fontWeight: '600', letterSpacing: '-0.01em' }}>North OS</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            {([['#features', 'Features'], ['#privacy', 'Privacy'], ['#compatibility', 'Compatibility'], ['#ai-providers', 'AI']] as [string, string][]).map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
                {label}
              </a>
            ))}
            <DownloadButton onDownload={() => setShowModal(true)} style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '8px' }} />
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════
          HERO
      ════════════════════════════════════════ */}
      <section style={{ maxWidth: '800px', margin: '0 auto', padding: '160px 24px 120px', textAlign: 'center', position: 'relative' }}>

        <div style={{ display: 'inline-flex', marginBottom: '32px' }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '4px 14px', borderRadius: '100px',
            border: '1px solid rgba(107,124,230,0.3)',
            background: 'rgba(107,124,230,0.08)',
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

        <DownloadButton onDownload={() => setShowModal(true)} size="lg" />

        <p style={{ marginTop: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
          Runs 100% on your machine · No account required · MIT License
        </p>
      </section>

      {/* ════════════════════════════════════════
          FEATURES
      ════════════════════════════════════════ */}
      <section id="features" style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '12px' }}>What it does</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: '700', letterSpacing: '-0.02em', color: 'white' }}>
            Everything that matters. Nothing that doesn't.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{
              padding: '28px', borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)',
              transition: 'border-color 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(107,124,230,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px', marginBottom: '16px',
                background: 'rgba(107,124,230,0.12)', border: '1px solid rgba(107,124,230,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', color: '#9b8cff',
              }}>{f.icon}</div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'white', marginBottom: '8px', letterSpacing: '-0.01em' }}>{f.title}</h3>
              <p style={{ fontSize: '14px', lineHeight: '1.65', color: 'rgba(255,255,255,0.4)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════
          PRIVACY
      ════════════════════════════════════════ */}
      <section id="privacy" style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{
          borderRadius: '20px', padding: '64px',
          border: '1px solid rgba(107,124,230,0.2)',
          background: 'linear-gradient(135deg, rgba(107,124,230,0.06) 0%, rgba(10,10,15,0) 60%)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '-60px', right: '-60px', width: '300px', height: '300px',
            background: 'radial-gradient(circle, rgba(107,124,230,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
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
                  <span style={{ color: '#6b7ce6', fontSize: '16px' }}>✓</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SYSTEM COMPATIBILITY
      ════════════════════════════════════════ */}
      <section id="compatibility" style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '12px' }}>System requirements</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: '700', letterSpacing: '-0.02em', color: 'white', marginBottom: '12px' }}>
            Runs on your hardware.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)', maxWidth: '500px', margin: '0 auto' }}>
            The app itself is lightweight. Local AI adds higher requirements — but you can always start with a cloud provider and switch later.
          </p>
        </div>

        {/* OS Support row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {COMPAT.os.map((os, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '20px 24px', borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <span style={{ fontSize: '28px', lineHeight: 1 }}>{os.icon}</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'white', marginBottom: '3px' }}>{os.name}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: '1.4' }}>{os.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Spec tiers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
          {COMPAT.tiers.map((tier, ti) => (
            <div key={ti} style={{
              borderRadius: '16px', padding: '32px',
              border: `1px solid ${tier.border}`,
              background: tier.color,
            }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'white', marginBottom: '4px', letterSpacing: '-0.01em' }}>{tier.title}</h3>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{tier.subtitle}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                {tier.specs.map((spec, si) => (
                  <div key={si} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '11px 0',
                    borderBottom: si < tier.specs.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}>
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>{spec.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.8)' }}>{spec.value}</span>
                  </div>
                ))}
              </div>

              {tier.note && (
                <div style={{
                  marginTop: '20px', padding: '14px 16px', borderRadius: '10px',
                  background: 'rgba(107,124,230,0.08)', border: '1px solid rgba(107,124,230,0.15)',
                }}>
                  <p style={{ fontSize: '12px', color: 'rgba(155,140,255,0.75)', lineHeight: '1.6', margin: 0 }}>
                    💡 {tier.note}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════
          PHILOSOPHY
      ════════════════════════════════════════ */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '12px' }}>Core philosophy</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: '700', letterSpacing: '-0.02em', color: 'white' }}>
            Built on five principles.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '2px', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
          {PHILOSOPHY.map((p, i) => (
            <div key={i} style={{
              padding: '32px 24px',
              background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.025)',
              borderRight: i < PHILOSOPHY.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}>
              <div style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em', color: 'rgba(107,124,230,0.6)', marginBottom: '16px', fontFamily: 'monospace' }}>{p.symbol}</div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'white', marginBottom: '10px', letterSpacing: '-0.01em' }}>{p.title}</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'rgba(255,255,255,0.35)' }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════
          AI PROVIDERS
      ════════════════════════════════════════ */}
      <section id="ai-providers" style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '12px' }}>AI providers</p>
          <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: '700', letterSpacing: '-0.02em', color: 'white', marginBottom: '12px' }}>
            Your AI. Your choice.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)', maxWidth: '480px', margin: '0 auto' }}>
            Use a free local model for full privacy, or connect any cloud provider. Switch any time from the Settings page.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
          {PROVIDERS.map((p, i) => (
            <div key={i} style={{
              padding: '10px 20px', borderRadius: '100px',
              border: '1px solid rgba(107,124,230,0.25)',
              background: 'rgba(107,124,230,0.07)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.75)' }}>{p.name}</span>
              <span style={{ fontSize: '11px', color: 'rgba(107,124,230,0.5)' }}>·</span>
              <span style={{ fontSize: '11px', color: 'rgba(155,140,255,0.55)' }}>{p.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════
          FINAL CTA
      ════════════════════════════════════════ */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 24px 120px' }}>
        <div style={{
          textAlign: 'center', padding: '80px 40px',
          borderRadius: '20px', position: 'relative', overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: '600px', height: '400px',
            background: 'radial-gradient(ellipse, rgba(107,124,230,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <p style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#6b7ce6', textTransform: 'uppercase', marginBottom: '20px' }}>Get started</p>
          <h2 style={{ fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.1', color: 'white', marginBottom: '20px' }}>
            Start understanding yourself.
          </h2>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.4)', maxWidth: '440px', margin: '0 auto 40px', lineHeight: '1.65' }}>
            Free, open source, and runs entirely on your machine. One command to install.
          </p>
          <div style={{ display: 'inline-block', padding: '16px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '32px' }}>
            <code style={{ fontSize: '13px', fontFamily: 'monospace', color: 'rgba(155,140,255,0.9)', letterSpacing: '0.02em' }}>
              git clone https://github.com/Jeevanrajss/Personal-OS.git && bash setup.sh
            </code>
          </div>
          <br />
          <DownloadButton onDownload={() => setShowModal(true)} size="lg" />
        </div>
      </section>

      {/* ════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════ */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '32px 24px',
        maxWidth: '1100px', margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '6px',
            background: 'linear-gradient(135deg, #6b7ce6, #9b8cff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: '700', color: 'white',
          }}>N</div>
          <span style={{ fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.5)' }}>North OS</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>MIT License</span>
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
          {[['#features', 'Features'], ['#privacy', 'Privacy'], ['#compatibility', 'Compatibility']].map(([href, label]) => (
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
