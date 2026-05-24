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
        this.playing = false;
        this.currentSrc = undefined;
      }
    };
    src.start();
    this.currentSrc = src;
    this.playing = true;
  }

  stop(): void {
    if (this.currentSrc) {
      try { this.currentSrc.stop(); } catch { /* already stopped */ }
      this.currentSrc = undefined;
    }
    this.playing = false;
  }
}
