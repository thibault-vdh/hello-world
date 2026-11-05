/** Minimal 16-bit PCM mono WAV encode/decode. Isomorphic (no Node/DOM APIs). */

export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(samples);
  return new Uint8Array(buf);
}

export interface DecodedWav {
  sampleRate: number;
  samples: Int16Array;
  seconds: number;
}

/** Strict parser: only accepts the exact format our recorder produces. */
export function decodeWav(bytes: Uint8Array): DecodedWav | null {
  if (bytes.byteLength < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let offset = 12;
  let sampleRate = 0;
  let fmtOk = false;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = v.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      const format = v.getUint16(body, true);
      const channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      const bits = v.getUint16(body + 14, true);
      fmtOk = format === 1 && channels === 1 && bits === 16 && sampleRate >= 16000 && sampleRate <= 48000;
      if (!fmtOk) return null;
    } else if (id === "data") {
      if (!fmtOk) return null;
      const len = Math.min(size, bytes.byteLength - body) & ~1;
      const copy = new Int16Array(len / 2);
      for (let i = 0; i < copy.length; i++) copy[i] = v.getInt16(body + i * 2, true);
      return { sampleRate, samples: copy, seconds: copy.length / sampleRate };
    }
    offset = body + size + (size & 1);
  }
  return null;
}

/** Seconds of audio above a simple energy gate (rough "speech" duration). */
export function voicedSeconds(samples: Int16Array, sampleRate: number): number {
  const frame = Math.round(sampleRate * 0.03);
  let voiced = 0;
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += samples[j] * samples[j];
    const rms = Math.sqrt(sum / frame) / 32768;
    if (rms > 0.012) voiced++;
  }
  return (voiced * frame) / sampleRate;
}
