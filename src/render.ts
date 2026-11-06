import { RoughGenerator } from "roughjs/bin/generator.js";
import type { ChallengeState } from "./types.js";

const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgecd",
  "7": "abc",
  "8": "abcdefg",
  "9": "abfgcd",
};

function segmentLine(
  generator: RoughGenerator,
  segment: string,
  x: number,
  y: number,
): { from: [number, number]; to: [number, number] } {
  const width = 28;
  const height = 48;
  const half = height / 2;

  switch (segment) {
    case "a":
      return { from: [x + 5, y], to: [x + width, y] };
    case "b":
      return { from: [x + width, y + 3], to: [x + width, y + half - 2] };
    case "c":
      return { from: [x + width, y + half + 2], to: [x + width, y + height - 3] };
    case "d":
      return { from: [x + 5, y + height], to: [x + width, y + height] };
    case "e":
      return { from: [x, y + half + 2], to: [x, y + height - 3] };
    case "f":
      return { from: [x, y + 3], to: [x, y + half - 2] };
    case "g":
      return { from: [x + 5, y + half], to: [x + width, y + half] };
    default:
      throw new Error("Unknown seven-segment line");
  }
}

export function renderChallengeSvg(state: ChallengeState): string {
  const generator = new RoughGenerator({ options: { seed: 1 } });
  const visibleCode = state.visibleCode ?? "";
  const inverseColor = state.inverseColor ?? "#f4e0cc";
  const paths: string[] = [];
  const digitGap = 10;
  const digitWidth = 36;
  const startX = 18;
  const baseY = 24;
  const rotations = [-1.6, 1.1, -0.7, 1.8, -1.2, 0.8];

  [...visibleCode].forEach((digit, index) => {
    const x = startX + index * (digitWidth + digitGap);
    const rotation = rotations[index] ?? 0;
    const digitPaths: string[] = [];

    for (const segment of SEGMENTS[digit] ?? "") {
      const { from, to } = segmentLine(generator, segment, x, baseY);
      const drawable = generator.line(from[0], from[1], to[0], to[1], {
        stroke: inverseColor,
        strokeWidth: 4.2,
        roughness: 1.15,
        bowing: 0.55,
        preserveVertices: true,
      });
      for (const path of generator.toPaths(drawable)) {
        digitPaths.push(`<path d="${path.d}" fill="none" />`);
      }
    }

    paths.push(
      `<g transform="rotate(${rotation} ${x + digitWidth / 2} ${baseY + 24})" ` +
        `stroke="${inverseColor}" stroke-width="4.2" stroke-linecap="round" ` +
        `stroke-linejoin="round">${digitPaths.join("")}</g>`,
    );
  });

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="112" viewBox="0 0 320 112" role="img" aria-label="Verification code image">',
    '<g opacity="0.15" filter="url(#grain)">',
    `<path d="M0 18H320M0 44H320M0 70H320M0 96H320" stroke="${inverseColor}" stroke-width="0.5" />`,
    "</g>",
    "<defs><filter id=\"grain\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"2\" seed=\"4\" /></filter></defs>",
    paths.join(""),
    "</svg>",
  ].join("");
}
