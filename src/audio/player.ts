type ACtor = { new (...args: any[]): AudioContext };
function getACtor(): ACtor {
  const w = window as any;
  return w.AudioContext ?? w.webkitAudioContext;
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
