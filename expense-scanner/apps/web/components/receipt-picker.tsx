'use client';
import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

const MAX_BYTES = 10 * 1024 * 1024;

/** Two clear choices: take a new photo, or pick one already in the gallery. Shows a preview before upload. */
export function ReceiptPicker() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { pending } = useFormStatus();

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const open = (camera: boolean) => {
    const el = input.current;
    if (!el) return;
    // Camera: accept must be the generic "image/*" — the Android app (Capacitor) only opens the
    // camera for image/*, and browsers treat it the same. "capture" opens the camera directly.
    // Gallery: no capture, so Android/iOS show the photo gallery / file picker.
    if (camera) {
      el.setAttribute('accept', 'image/*');
      el.setAttribute('capture', 'environment');
    } else {
      el.setAttribute('accept', 'image/jpeg,image/png,image/webp');
      el.removeAttribute('capture');
    }
    el.click();
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setProblem(null);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      setProblem('Please choose a JPEG, PNG or WebP image.');
      e.target.value = '';
      return;
    }
    if (f.size > MAX_BYTES) {
      setProblem('This photo is larger than 10 MB. Please choose a smaller one.');
      e.target.value = '';
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  return (
    <div className="space-y-4">
      <input ref={input} type="file" name="file" accept="image/jpeg,image/png,image/webp" onChange={onChange} className="hidden" />

      {!preview ? (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => open(true)} className="card flex flex-col items-center gap-2 py-6 hover:border-accent">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent" aria-hidden>
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
            </svg>
            <span className="text-sm font-medium">Take photo</span>
          </button>
          <button type="button" onClick={() => open(false)} className="card flex flex-col items-center gap-2 py-6 hover:border-accent">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" />
            </svg>
            <span className="text-sm font-medium">Choose from gallery</span>
          </button>
        </div>
      ) : (
        <div className="card space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selected receipt" className="max-h-80 w-full rounded-lg object-contain" />
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span className="truncate">{file?.name} · {file ? (file.size / 1024 / 1024).toFixed(1) : 0} MB</span>
            <button type="button" disabled={pending} onClick={() => { setFile(null); setPreview(null); if (input.current) input.current.value = ''; }} className="text-accent">
              Change
            </button>
          </div>
        </div>
      )}

      {problem && <p className="flag" role="alert">{problem}</p>}
      <p className="text-xs text-muted">Flat, well-lit, whole receipt in frame. Max 10 MB. Location data is removed.</p>
    </div>
  );
}
