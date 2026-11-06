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

export type AnimalSound = "cat" | "dog" | "bird";

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

function animalSample(kind: AnimalSound, sample: number, length: number): number {
  const progress = sample / length;
  const seconds = sample / SAMPLE_RATE;
  const edge = Math.sin(Math.PI * progress);

  if (kind === "cat") {
    const glide = 760 - 360 * progress;
    const vibrato = 1 + 0.035 * Math.sin(2 * Math.PI * 5.5 * seconds);
    return (
      edge ** 1.4 *
      (0.42 * Math.sin((2 * Math.PI * glide * vibrato * sample) / SAMPLE_RATE) +
        0.16 * Math.sin((4 * Math.PI * glide * vibrato * sample) / SAMPLE_RATE))
    );
  }

  if (kind === "dog") {
    const pulse = Math.max(0, Math.sin(2 * Math.PI * 3.6 * seconds));
    return (
      Math.pow(edge, 0.45) *
      (0.32 * Math.sin((2 * Math.PI * (185 - 35 * progress) * sample) / SAMPLE_RATE) +
        0.22 * pulse * noise(sample))
    );
  }

  const chirpPhase = (seconds * 4.5) % 1;
  const chirpEnvelope = Math.sin(Math.PI * Math.min(1, chirpPhase * 1.8));
  const frequency = 1_180 + 1_250 * Math.sin(Math.PI * progress) ** 2;
  return (
    edge *
    chirpEnvelope *
    (0.32 * Math.sin((2 * Math.PI * frequency * sample) / SAMPLE_RATE) +
      0.12 * Math.sin((4 * Math.PI * frequency * sample) / SAMPLE_RATE))
  );
}

export function renderAnimalSequenceWave(animals: readonly AnimalSound[]): Buffer {
  const gapSamples = Math.round(SAMPLE_RATE * 0.16);
  const leadingSilence = Math.round(SAMPLE_RATE * 0.08);
  const callSamples = animals.map((animal) =>
    Math.round(
      SAMPLE_RATE *
        (animal === "cat" ? 0.62 : animal === "dog" ? 0.42 : 0.34),
    ),
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
