// Shared audio utilities for the app
// Only runs on client side - safe for SSR

// Use a function to lazily create and store the AudioContext
// This avoids temporal dead zone issues with minification
function getAudioContextInternal(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return null;
    return new AudioContextCtor();
  } catch {
    // Ignore initialization errors
    return null;
  }
}

// Store context on window to survive HMR and avoid module-level TDZ issues
function getStoredContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & typeof globalThis & { __appAudioContext?: AudioContext };
  if (!w.__appAudioContext) {
    w.__appAudioContext = getAudioContextInternal();
  }
  return w.__appAudioContext;
}

export function getAudioContext(): AudioContext | null {
  return getStoredContext();
}

export function createBeep(frequency: number, duration: number, volume = 0.3): void {
  const ctx = getStoredContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();

  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Ignore audio errors
  }
}

export function playNotificationSound(): void {
  createBeep(800, 0.15, 0.4);
  setTimeout(() => createBeep(600, 0.15, 0.3), 100);
}

// Ringing pattern state
let ringingInterval: ReturnType<typeof setInterval> | null = null;
let ringingOscillator: OscillatorNode | null = null;
let ringingGain: GainNode | null = null;

export function playRingingSound(): void {
  const ctx = getStoredContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();

  // Clear any existing pattern
  stopRingingSound();

  // Ring pattern: 1s on, 2s off, 1s on, 2s off, 1s on, 4s off (repeats)
  const ringPattern = [
    { on: true, duration: 1000 }, // Ring for 1s
    { on: false, duration: 2000 }, // Silent for 2s
    { on: true, duration: 1000 }, // Ring for 1s
    { on: false, duration: 2000 }, // Silent for 2s
    { on: true, duration: 1000 }, // Ring for 1s
    { on: false, duration: 4000 }, // Silent for 4s
  ];

  let patternIndex = 0;

  const playRing = () => {
    const segment = ringPattern[patternIndex];

    if (!segment) return;
    if (ringingOscillator) {
      try {
        ringingOscillator.stop();
        ringingOscillator.disconnect();
      } catch {
        // Ignore cleanup errors
      }
      ringingOscillator = null;
    }
    if (ringingGain) {
      ringingGain.disconnect();
      ringingGain = null;
    }
    if (segment.on) {
      try {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.frequency.value = 440;
        oscillator.type = "sine";
        gain.gain.value = 0.3;
        oscillator.start();

        ringingOscillator = oscillator;
        ringingGain = gain;
      } catch {
        // Ignore audio errors
      }
    }

    patternIndex = (patternIndex + 1) % ringPattern.length;
    ringingInterval = setTimeout(playRing, segment.duration);
  };

  playRing();
}

export function stopRingingSound(): void {
  if (ringingInterval) {
    clearTimeout(ringingInterval);
    ringingInterval = null;
  }

  if (ringingOscillator) {
    try {
      ringingOscillator.stop();
      ringingOscillator.disconnect();
    } catch {
      // Ignore cleanup errors
    }
    ringingOscillator = null;
  }
  if (ringingGain) {
    try {
      ringingGain.disconnect();
    } catch {
      // Ignore cleanup errors
    }
    ringingGain = null;
  }
}

export function unlockAudioContext(): void {
  const ctx = getStoredContext();
  if (ctx?.state === "suspended") ctx.resume();
}
