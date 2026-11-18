let audio: AudioContext | undefined;

/** One short tone for a valid ticket, two low ones for anything else; vibrates where supported. */
export function signal(ok: boolean) {
  navigator.vibrate?.(ok ? 80 : [120, 80, 120]);
  try {
    audio ??= new AudioContext();
    const tones = ok ? [880] : [220, 220];
    tones.forEach((frequency, i) => {
      const start = audio!.currentTime + i * 0.18;
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.frequency.value = frequency;
      osc.type = ok ? "sine" : "square";
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      osc.connect(gain).connect(audio!.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  } catch {
    // Sound is a nicety; the colour already tells the result.
  }
}
