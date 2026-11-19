// Web Audio API synthesizer for pleasant, reliable in-browser Economic News & Alert chimes.
// Zero external audio assets required; works offline inside PWA & browser tabs.

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
}

export function playNewsAlarmSound(): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    const now = ctx.currentTime;
    // Crisp 3-note ascending trading alert chime (C6 -> E6 -> G6) with soft exponential decay
    const notes = [
      { freq: 1046.5, start: 0.0, duration: 0.22, gain: 0.16 },
      { freq: 1318.51, start: 0.14, duration: 0.24, gain: 0.18 },
      { freq: 1567.98, start: 0.29, duration: 0.42, gain: 0.2 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(note.gain, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}
