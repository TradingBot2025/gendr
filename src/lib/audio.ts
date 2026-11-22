// Shared audio utilities for the app
// Only runs on client side

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return null;
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function createBeep(frequency: number, duration: number, volume = 0.3): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  
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
}

export function playNotificationSound(): void {
  createBeep(800, 0.15, 0.4);
  setTimeout(() => createBeep(600, 0.15, 0.3), 100);
}

export function playRingingSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.frequency.value = 440;
  oscillator.type = "sine";
  gain.gain.value = 0.3;
  oscillator.start();
  
  (window as any).__ringingOscillator = oscillator;
  (window as any).__ringingGain = gain;
}

export function stopRingingSound(): void {
  if (typeof window === "undefined") return;
  const osc = (window as any).__ringingOscillator;
  const gain = (window as any).__ringingGain;
  if (osc) { 
    try { osc.stop(); osc.disconnect(); } catch {} 
    (window as any).__ringingOscillator = null; 
  }
  if (gain) { 
    try { gain.disconnect(); } catch {} 
    (window as any).__ringingGain = null; 
  }
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") ctx.resume();
}