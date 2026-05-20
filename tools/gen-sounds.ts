import * as fs from "fs";
import * as path from "path";

const SAMPLE_RATE = 44100;
const AMPLITUDE = 0.3;

interface Note {
  freq: number;
  durationMs: number;
}

function envelope(i: number, total: number): number {
  const fade = Math.floor(SAMPLE_RATE * 0.01);
  if (i < fade) {
    return i / fade;
  }
  if (i > total - fade) {
    return Math.max(0, (total - i) / fade);
  }
  return 1;
}

function synth(notes: Note[]): Int16Array {
  const samples: number[] = [];
  for (const note of notes) {
    const count = Math.floor((note.durationMs / 1000) * SAMPLE_RATE);
    for (let i = 0; i < count; i += 1) {
      const t = i / SAMPLE_RATE;
      const value = Math.sin(2 * Math.PI * note.freq * t) * AMPLITUDE * envelope(i, count);
      samples.push(Math.round(value * 32767));
    }
  }
  return Int16Array.from(samples);
}

function buildWav(samples: Int16Array): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buffer;
}

const SOUNDS: Record<string, Note[]> = {
  // Two-note ascending chime — "done".
  "done.wav": [
    { freq: 659.25, durationMs: 160 },
    { freq: 987.77, durationMs: 220 },
  ],
  // Short rising double blip — "needs your input".
  "question.wav": [
    { freq: 880.0, durationMs: 110 },
    { freq: 1174.66, durationMs: 150 },
  ],
  // Single short tick.
  "tick.wav": [{ freq: 1046.5, durationMs: 90 }],
};

function main(): void {
  const outDir = path.resolve(__dirname, "..", "..", "sounds");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, notes] of Object.entries(SOUNDS)) {
    const wav = buildWav(synth(notes));
    fs.writeFileSync(path.join(outDir, name), wav);
    process.stdout.write(`wrote ${name} (${wav.length} bytes)\n`);
  }
}

main();
