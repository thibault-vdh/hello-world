"use client";

/**
 * Microphone engine: one AudioContext for the page lifetime (iOS only lets a
 * context start from a tap), mic tracks started/stopped per step.
 *  - level: smoothed RMS for the waveform (read from a ref, no re-renders)
 *  - 16 kHz Int16 chunks (~100 ms) for realtime STT
 *  - full-rate Int16 recording for voice cloning (live capture only; no uploads)
 */

export type MicErrorKind = "denied" | "unsupported" | "no-device" | "unknown";

export class MicError extends Error {
  constructor(public kind: MicErrorKind, message: string) {
    super(message);
  }
}

const STT_RATE = 16000;
const STT_CHUNK = 1600; // 100 ms

export class MicEngine {
  ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private moduleLoaded = false;

  level = 0;
  lastVoiceAt = 0;
  private listeners = new Set<(pcm: Int16Array) => void>();
  private sttBuf = new Int16Array(STT_CHUNK);
  private sttLen = 0;
  private resamplePos = 0;

  private recChunks: Int16Array[] = [];
  private recLength = 0;
  private recording = false;

  get sampleRate() {
    return this.ctx?.sampleRate ?? 48000;
  }
  get running() {
    return Boolean(this.stream) && this.ctx?.state === "running";
  }

  static supported(): boolean {
    return (
      typeof window !== "undefined" &&
      window.isSecureContext &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof AudioWorkletNode !== "undefined"
    );
  }

  /** Must be called from a user gesture the first time (mic prompt + iOS audio unlock). */
  async start(): Promise<void> {
    if (!MicEngine.supported()) throw new MicError("unsupported", "This browser can’t record audio.");
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: "interactive" });
    // Resume synchronously inside the gesture (iOS), before any await.
    const resuming = this.ctx.state !== "running" ? this.ctx.resume().catch(() => {}) : null;
    if (!this.moduleLoaded) {
      await this.ctx.audioWorklet.addModule("/worklets/capture.js");
      this.moduleLoaded = true;
    }
    await resuming;
    if (this.stream) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("denied", "Microphone access was blocked.");
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new MicError("no-device", "No microphone found.");
      throw new MicError("unknown", "We couldn’t start your microphone.");
    }
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "capture-processor");
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data);
    this.source.connect(this.node);
    this.node.connect(this.sink).connect(this.ctx.destination);
    this.lastVoiceAt = performance.now();
  }

  /** Stop mic tracks (indicator off). The AudioContext is kept for later steps. */
  stop() {
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = this.source = this.node = this.sink = null;
    this.level = 0;
    this.sttLen = 0;
  }

  onPcm16k(fn: (pcm: Int16Array) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  startRecording() {
    this.recChunks = [];
    this.recLength = 0;
    this.recording = true;
  }
  stopRecording() {
    this.recording = false;
  }
  clearRecording() {
    this.recChunks = [];
    this.recLength = 0;
  }
  /** Current recording position in samples. */
  position() {
    return this.recLength;
  }
  slice(start: number, end: number): Int16Array {
    const out = new Int16Array(Math.max(0, end - start));
    let offset = 0;
    let written = 0;
    for (const c of this.recChunks) {
      const cStart = offset;
      const cEnd = offset + c.length;
      offset = cEnd;
      if (cEnd <= start) continue;
      if (cStart >= end) break;
      const from = Math.max(start, cStart) - cStart;
      const to = Math.min(end, cEnd) - cStart;
      out.set(c.subarray(from, to), written);
      written += to - from;
    }
    return out.subarray(0, written);
  }

  private onFrame(f32: Float32Array) {
    let sum = 0;
    for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
    const rms = Math.sqrt(sum / f32.length);
    const target = Math.min(1, rms * 6);
    this.level = target > this.level ? this.level * 0.4 + target * 0.6 : this.level * 0.85 + target * 0.15;
    if (rms > 0.02) this.lastVoiceAt = performance.now();

    if (this.recording) {
      const pcm = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) pcm[i] = Math.max(-1, Math.min(1, f32[i])) * 0x7fff;
      this.recChunks.push(pcm);
      this.recLength += pcm.length;
    }

    if (!this.listeners.size) return;
    // Box-filter downsample to 16 kHz (good enough for speech recognition).
    const ratio = this.sampleRate / STT_RATE;
    let pos = this.resamplePos;
    while (pos + ratio <= f32.length) {
      const a = Math.floor(pos);
      const b = Math.min(f32.length, Math.floor(pos + ratio));
      let acc = 0;
      for (let i = a; i < b; i++) acc += f32[i];
      const v = acc / Math.max(1, b - a);
      this.sttBuf[this.sttLen++] = Math.max(-1, Math.min(1, v)) * 0x7fff;
      if (this.sttLen === STT_CHUNK) {
        const chunk = this.sttBuf.slice(0);
        this.sttLen = 0;
        this.listeners.forEach((l) => l(chunk));
      }
      pos += ratio;
    }
    this.resamplePos = pos - f32.length;
  }
}

/** Trim leading/trailing silence, keeping a little padding. */
export function trimSilence(samples: Int16Array, sampleRate: number, padSec = 0.25): Int16Array {
  const frame = Math.round(sampleRate * 0.02);
  const isVoiced = (i: number) => {
    let s = 0;
    for (let j = i; j < Math.min(samples.length, i + frame); j++) s += samples[j] * samples[j];
    return Math.sqrt(s / frame) / 32768 > 0.015;
  };
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i += frame) {
    if (isVoiced(i)) {
      if (first < 0) first = i;
      last = i + frame;
    }
  }
  if (first < 0) return samples;
  const pad = Math.round(padSec * sampleRate);
  return samples.subarray(Math.max(0, first - pad), Math.min(samples.length, last + pad));
}

export function concatPcm(parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
