import { useState, useRef, useEffect, useCallback } from 'react';
import { Fingerprint } from 'lucide-react';

// ── Storage keys ─────────────────────────────────────────────────────────────

const LOCK_KEY      = 'app_lock_hash';
const BIOMETRIC_KEY = 'app_biometric_cred';

// ── PIN / password helpers ───────────────────────────────────────────────────

export async function hashLock(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getLockHash(): string | null {
  return localStorage.getItem(LOCK_KEY);
}
export function setLockHash(hash: string): void {
  localStorage.setItem(LOCK_KEY, hash);
}
export function clearLockHash(): void {
  localStorage.removeItem(LOCK_KEY);
}

// ── Biometric helpers (WebAuthn platform authenticator) ──────────────────────

export function getBiometricCredId(): string | null {
  return localStorage.getItem(BIOMETRIC_KEY);
}
export function setBiometricCredId(id: string): void {
  localStorage.setItem(BIOMETRIC_KEY, id);
}
export function clearBiometricCredId(): void {
  localStorage.removeItem(BIOMETRIC_KEY);
}

/** Returns true when the OS has a platform authenticator (Touch ID, Windows Hello, etc.) */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Register a new platform biometric credential. Returns base64-encoded credential ID. */
export async function registerBiometric(): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const uid       = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'North OS', id: window.location.hostname },
      user: { id: uid, name: 'north-os-user', displayName: 'North OS User' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7   }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        requireResidentKey: false,
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential;

  return btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
}

/** Prompt the OS biometric. Returns true on success. */
export async function verifyBiometric(credIdBase64: string): Promise<boolean> {
  try {
    const credId    = Uint8Array.from(atob(credIdBase64), (c) => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const result = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [{ type: 'public-key', id: credId, transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!result;
  } catch {
    return false;
  }
}

// ── Lock screen component ────────────────────────────────────────────────────

type Props = { onUnlock: () => void };

export function LockScreen({ onUnlock }: Props) {
  const [value, setValue]           = useState('');
  const [error, setError]           = useState('');
  const [shake, setShake]           = useState(false);
  const [loading, setLoading]       = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [showBioBtn, setShowBioBtn] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // On mount: try biometric automatically if a credential is stored
  useEffect(() => {
    const credId = getBiometricCredId();
    if (!credId) return;

    setShowBioBtn(true); // show the button even while auto-attempting

    const timer = setTimeout(async () => {
      setBioLoading(true);
      try {
        const ok = await verifyBiometric(credId);
        if (ok) { onUnlock(); return; }
      } catch {
        // user cancelled — just fall back to PIN
      } finally {
        setBioLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [onUnlock]);

  // Focus the PIN input after biometric attempt (or if no biometric)
  useEffect(() => {
    if (!bioLoading) inputRef.current?.focus();
  }, [bioLoading]);

  // Manual biometric trigger
  const tryBiometric = useCallback(async () => {
    const credId = getBiometricCredId();
    if (!credId || bioLoading) return;
    setBioLoading(true);
    setError('');
    try {
      const ok = await verifyBiometric(credId);
      if (ok) { onUnlock(); return; }
      setError('Biometric check failed. Enter your PIN.');
    } catch {
      setError('Biometric cancelled. Enter your PIN below.');
    } finally {
      setBioLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [bioLoading, onUnlock]);

  // PIN / password submit
  const tryPin = useCallback(async () => {
    if (!value.trim() || loading) return;
    setLoading(true);
    try {
      const hash = await hashLock(value);
      if (hash === getLockHash()) {
        onUnlock();
      } else {
        setValue('');
        setError('Wrong PIN or password. Try again.');
        setShake(true);
        setTimeout(() => { setShake(false); inputRef.current?.focus(); }, 500);
      }
    } finally {
      setLoading(false);
    }
  }, [value, loading, onUnlock]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 52, height: 52, borderRadius: 16,
          background: 'var(--grad-primary)',
          boxShadow: 'var(--elev-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 19 21 12 17 5 21 12 2" />
        </svg>
      </div>

      <h1 style={{
        margin: '0 0 6px',
        font: '600 22px/1.2 var(--font-display)',
        letterSpacing: '-0.02em',
        color: 'var(--fg-1)',
      }}>
        North OS
      </h1>
      <p style={{ margin: '0 0 32px', fontSize: 13, color: 'var(--fg-4)' }}>
        {showBioBtn ? 'Use biometrics or enter your PIN to continue' : 'Enter your PIN or password to continue'}
      </p>

      {/* Lock card */}
      <div
        style={{
          width: 320,
          background: 'var(--surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 18,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          animation: shake ? 'lock-shake 0.5s ease' : undefined,
        }}
      >
        {/* Fingerprint button — shown when biometric credential is stored */}
        {showBioBtn && (
          <button
            type="button"
            onClick={tryBiometric}
            disabled={bioLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              padding: '12px',
              borderRadius: 12,
              border: '1px solid rgb(var(--primary-rgb) / 0.35)',
              background: 'rgb(var(--primary-rgb) / 0.10)',
              color: bioLoading ? 'var(--fg-4)' : 'var(--primary-300)',
              fontSize: 14,
              fontWeight: 500,
              cursor: bioLoading ? 'default' : 'pointer',
              transition: 'all 0.15s',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={(e) => {
              if (!bioLoading) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgb(var(--primary-rgb) / 0.18)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(var(--primary-rgb) / 0.55)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgb(var(--primary-rgb) / 0.10)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(var(--primary-rgb) / 0.35)';
            }}
          >
            <Fingerprint
              style={{
                width: 20, height: 20,
                animation: bioLoading ? 'bio-pulse 1.2s ease-in-out infinite' : undefined,
              }}
            />
            {bioLoading ? 'Waiting for biometric…' : 'Use fingerprint / Face ID'}
          </button>
        )}

        {/* Divider */}
        {showBioBtn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontSize: 11, color: 'var(--fg-disabled)', letterSpacing: '0.05em' }}>OR</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>
        )}

        {/* PIN / password input */}
        <input
          ref={inputRef}
          type="password"
          placeholder="PIN or password"
          value={value}
          autoComplete="current-password"
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') tryPin(); }}
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: 10,
            background: 'var(--surface-elev)',
            border: `1px solid ${error ? 'var(--accent-red)' : 'rgb(var(--overlay-rgb) / 0.08)'}`,
            color: 'var(--fg-1)',
            fontSize: 16,
            letterSpacing: '0.2em',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
        />

        {error && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--accent-red)' }}>{error}</p>
        )}

        <button
          type="button"
          onClick={tryPin}
          disabled={!value.trim() || loading}
          style={{
            width: '100%',
            padding: '11px',
            borderRadius: 10,
            background: 'var(--grad-primary)',
            border: 'none',
            color: 'var(--on-primary)',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            cursor: value.trim() && !loading ? 'pointer' : 'default',
            opacity: value.trim() && !loading ? 1 : 0.45,
            transition: 'opacity 0.15s',
          }}
        >
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      </div>

      <p style={{ marginTop: 24, fontSize: 11.5, color: 'var(--fg-disabled)' }}>
        Locked · your data stays on this device
      </p>

      <style>{`
        @keyframes lock-shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-5px); }
          80%      { transform: translateX(5px); }
        }
        @keyframes bio-pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
      `}</style>
    </div>
  );
}
