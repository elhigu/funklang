type ACtor = { new (...args: any[]): AudioContext };
function getACtor(): ACtor {
  const w = window as any;
  return w.AudioContext ?? w.webkitAudioContext;
}

// iOS silences Web Audio routed to the built-in speaker while the hardware
// mute/silent switch is on — headphones still play, which is exactly the
// "no sound unless I plug in headphones" symptom on iPhones. Declaring a
// 'playback' audio session (Safari 16.4+, the WebAudio audio-session API)
// tells iOS this is media playback that should ignore the mute switch and use
// the speaker. Feature-detected, so it's a harmless no-op on Android, desktop,
// and older iOS.
function declarePlaybackSession(): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    /* unsupported / read-only — ignore */
  }
}

export class Player {
  private ctx?: AudioContext;
  private gain?: GainNode;
  private currentSrc: AudioBufferSourceNode | undefined = undefined;
  private playing = false;

  /** Fired whenever audible playback starts (true) or stops (false). Lets the
   *  UI surface "audio is sounding" in the footer status light. */
  onStateChange?: (playing: boolean) => void;

  private setPlaying(p: boolean): void {
    if (this.playing === p) return;
    this.playing = p;
    this.onStateChange?.(p);
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      const C = getACtor();
      if (!C) throw new Error('Web Audio API not available');
      declarePlaybackSession();      // route to the speaker even with the iOS mute switch on
      this.ctx = new C();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMaster(g: number): void { if (this.gain) this.gain.gain.value = g; }

  isPlaying(): boolean { return this.playing; }

  play(sample: Int16Array, sampleRate: number): void {
    const ctx = this.ensure();
    this.stop();
    const buf = ctx.createBuffer(1, sample.length, sampleRate);
    const ch = new Float32Array(sample.length);
    for (let i = 0; i < sample.length; i++) ch[i] = sample[i]! / 32768;
    buf.copyToChannel(ch, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain!);
    src.onended = () => {
      if (this.currentSrc === src) {
        this.currentSrc = undefined;
        this.setPlaying(false);
      }
    };
    src.start();
    this.currentSrc = src;
    this.setPlaying(true);
  }

  stop(): void {
    if (this.currentSrc) {
      try { this.currentSrc.stop(); } catch { /* already stopped */ }
      this.currentSrc = undefined;
    }
    this.setPlaying(false);
  }
}
