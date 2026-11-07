const SAMPLE_RATE = 16_000;
const DTMF: Record<string, [number, number]> = {
  "0": [941, 1336],
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
};

export type AnimalSound =
  | "cat"
  | "dog"
  | "bird"
  | "monkey"
  | "horse"
  | "snake"
  | "bear"
  | "mouse"
  | "elephant"
  | "seal";

function sine(frequency: number, sample: number): number {
  return Math.sin((2 * Math.PI * frequency * sample) / SAMPLE_RATE);
}

function writeWave(samples: Int16Array): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index] ?? 0, 44 + index * 2);
  }
  return buffer;
}

export function renderDtmfWave(code: string): Buffer {
  const toneSamples = Math.round(SAMPLE_RATE * 0.18);
  const gapSamples = Math.round(SAMPLE_RATE * 0.09);
  const silence = Math.round(SAMPLE_RATE * 0.05);
  const totalSamples = silence + code.length * (toneSamples + gapSamples);
  const samples = new Int16Array(totalSamples);

  let offset = silence;
  for (const digit of code) {
    const frequencies = DTMF[digit];
    if (!frequencies) {
      continue;
    }

    for (let sample = 0; sample < toneSamples; sample += 1) {
      const envelope = Math.sin((Math.PI * sample) / toneSamples);
      const value =
        0.26 * envelope * (sine(frequencies[0], sample) + sine(frequencies[1], sample));
      samples[offset + sample] = Math.round(value * 32_767);
    }
    offset += toneSamples + gapSamples;
  }

  return writeWave(samples);
}

function noise(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43_758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function pulse(seconds: number, start: number, duration: number): number {
  const progress = (seconds - start) / duration;
  if (progress < 0 || progress > 1) {
    return 0;
  }
  return Math.sin(Math.PI * progress) ** 1.7;
}

function voiced(
  frequency: number,
  sample: number,
  brightness = 0.24,
): number {
  const phase = (2 * Math.PI * frequency * sample) / SAMPLE_RATE;
  return (
    Math.sin(phase) +
    brightness * Math.sin(phase * 2.02 + 0.3) +
    brightness * 0.45 * Math.sin(phase * 3.01 + 0.8)
  );
}

function animalSample(kind: AnimalSound, sample: number, length: number): number {
  const progress = sample / length;
  const seconds = sample / SAMPLE_RATE;
  const edge = Math.sin(Math.PI * progress);

  if (kind === "cat") {
    const contour = progress < 0.28
      ? 620 + progress * 900
      : 870 - (progress - 0.28) * 720;
    const vibrato = 1 + 0.06 * Math.sin(2 * Math.PI * 7.2 * seconds) * progress;
    return edge ** 1.15 * 0.38 * voiced(contour * vibrato, sample, 0.32);
  }

  if (kind === "dog") {
    const first = pulse(seconds, 0.02, 0.23);
    const second = pulse(seconds, 0.34, 0.27);
    const bark = first + second * 0.92;
    const frequency = seconds < 0.3 ? 190 : 165;
    return bark * (0.3 * voiced(frequency, sample, 0.4) + 0.2 * noise(sample));
  }

  if (kind === "bird") {
    const chirp =
      pulse(seconds, 0.01, 0.08) +
      pulse(seconds, 0.13, 0.09) +
      pulse(seconds, 0.28, 0.11);
    const frequency = 1_650 + 1_950 * Math.max(0, Math.sin(Math.PI * progress));
    return chirp * 0.26 * Math.sin((2 * Math.PI * frequency * sample) / SAMPLE_RATE);
  }

  if (kind === "monkey") {
    const hoot =
      pulse(seconds, 0.01, 0.12) +
      pulse(seconds, 0.17, 0.11) +
      pulse(seconds, 0.32, 0.15);
    const frequency = 430 + 560 * progress;
    return hoot * (0.3 * voiced(frequency, sample, 0.28) + 0.04 * noise(sample));
  }

  if (kind === "horse") {
    const flutter = 1 + 0.11 * Math.sin(2 * Math.PI * 17 * seconds);
    const frequency = (760 - 520 * progress) * flutter;
    return edge ** 0.75 * 0.32 * (voiced(frequency, sample, 0.37) + 0.08 * noise(sample));
  }

  if (kind === "snake") {
    const air = 0.7 + 0.3 * Math.sin(2 * Math.PI * 3.7 * seconds);
    return edge * air * (0.31 * noise(sample) + 0.035 * voiced(3_100, sample, 0.04));
  }

  if (kind === "bear") {
    const rumble = 0.72 + 0.28 * Math.sin(2 * Math.PI * 2.3 * seconds);
    return edge ** 0.55 * rumble * (0.38 * voiced(78 - 8 * progress, sample, 0.42) + 0.15 * noise(sample));
  }

  if (kind === "mouse") {
    const squeak =
      pulse(seconds, 0.01, 0.1) +
      pulse(seconds, 0.16, 0.09);
    const frequency = 2_300 + 1_250 * Math.sin(Math.PI * progress);
    return squeak * 0.2 * Math.sin((2 * Math.PI * frequency * sample) / SAMPLE_RATE);
  }

  if (kind === "elephant") {
    const blast = pulse(seconds, 0.01, 0.5);
    const frequency = progress < 0.58
      ? 250 + 620 * progress
      : 610 - 300 * (progress - 0.58);
    return blast * (0.36 * voiced(frequency, sample, 0.48) + 0.07 * noise(sample));
  }

  const seal =
    pulse(seconds, 0.01, 0.12) +
    pulse(seconds, 0.15, 0.12) +
    pulse(seconds, 0.3, 0.13);
  return seal * (0.26 * voiced(360 - 150 * progress, sample, 0.32) + 0.16 * noise(sample));
}

export function renderAnimalSequenceWave(animals: readonly AnimalSound[]): Buffer {
  const gapSamples = Math.round(SAMPLE_RATE * 0.16);
  const leadingSilence = Math.round(SAMPLE_RATE * 0.08);
  const durations: Record<AnimalSound, number> = {
    cat: 0.62,
    dog: 0.42,
    bird: 0.34,
    monkey: 0.4,
    horse: 0.48,
    snake: 0.36,
    bear: 0.5,
    mouse: 0.3,
    elephant: 0.55,
    seal: 0.44,
  };
  const callSamples = animals.map((animal) =>
    Math.round(SAMPLE_RATE * durations[animal]),
  );
  const totalSamples =
    leadingSilence +
    callSamples.reduce((total, value) => total + value, 0) +
    gapSamples * Math.max(0, animals.length - 1);
  const samples = new Int16Array(totalSamples);
  let offset = leadingSilence;

  animals.forEach((animal, animalIndex) => {
    const length = callSamples[animalIndex] ?? 0;
    for (let sample = 0; sample < length; sample += 1) {
      samples[offset + sample] = Math.round(animalSample(animal, sample, length) * 28_000);
    }
    offset += length + gapSamples;
  });

  return writeWave(samples);
}
