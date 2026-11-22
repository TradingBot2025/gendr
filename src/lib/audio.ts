// Shared audio utilities for the app
// Only runs on client side - safe for SSR

// Use a function to lazily create and store the AudioContext
// This avoids temporal dead zone issues with minification
function getAudioContextInternal(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    return new AudioContextCtor();
  } catch {
    return null;
  }
}

// Store context on window to survive HMR and avoid module-level TDZ issues
function getStoredContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
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

export function playRingingSound(): void {
  const ctx = getStoredContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 440;
    oscillator.type = "sine";
    gain.gain.value = 0.3;
    oscillator.start();
    
    const w = window as any;
    w.__ringingOscillator = oscillator;
    w.__ringingGain = gain;
  } catch {
    // Ignore audio errors
  }
}

export function stopRingingSound(): void {
  if (typeof window === "undefined") return;
  const w = window as any;
  const osc = w.__ringingOscillator;
  const gain = w.__ringingGain;
  if (osc) { 
    try { osc.stop(); osc.disconnect(); } catch {} 
    w.__ringingOscillator = null; 
  }
  if (gain) { 
    try { gain.disconnect(); } catch {} 
    w.__ringingGain = null; 
  }
}

export function unlockAudioContext(): void {
  const ctx = getStoredContext();
  if (ctx?.state === "suspended") ctx.resume();
}