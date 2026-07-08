// Lightweight WebAudio click / tick sound. No external assets.
let ctx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

type Variant = "tap" | "soft" | "pop" | "toggle";

export function playClick(variant: Variant = "tap") {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;

  const now = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g);
  g.connect(c.destination);

  let f1 = 880, f2 = 520, dur = 0.07, peak = 0.08, type: OscillatorType = "sine";
  if (variant === "soft")   { f1 = 660; f2 = 440; dur = 0.09; peak = 0.05; }
  if (variant === "pop")    { f1 = 1200; f2 = 700; dur = 0.06; peak = 0.10; type = "triangle"; }
  if (variant === "toggle") { f1 = 520; f2 = 980; dur = 0.12; peak = 0.07; type = "triangle"; }

  o.type = type;
  o.frequency.setValueAtTime(f1, now);
  o.frequency.exponentialRampToValueAtTime(Math.max(60, f2), now + dur);

  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  o.start(now);
  o.stop(now + dur + 0.02);
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (typeof window !== "undefined") window.localStorage.setItem("mumnun-sound", v ? "1" : "0");
}
export function isSoundEnabled() {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem("mumnun-sound");
  if (v === "0") { enabled = false; return false; }
  enabled = true;
  return true;
}

// Auto-init from storage
if (typeof window !== "undefined") isSoundEnabled();
