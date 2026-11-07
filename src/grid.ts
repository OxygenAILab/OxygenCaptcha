import {
  Bike,
  Bird,
  Cat,
  Dog,
  Fish,
  Guitar,
  Pizza,
  Plane,
  Rocket,
  TreePine,
  Trophy,
  Umbrella,
} from "lucide";
import { randomInt } from "node:crypto";
import type { GridState } from "./types.js";

type IconNode = Array<[string, Record<string, string | number>]>;

const ICONS = {
  cat: { node: Cat as unknown as IconNode, label: "猫" },
  dog: { node: Dog as unknown as IconNode, label: "狗" },
  bird: { node: Bird as unknown as IconNode, label: "鸟" },
  fish: { node: Fish as unknown as IconNode, label: "鱼" },
  rocket: { node: Rocket as unknown as IconNode, label: "火箭" },
  bike: { node: Bike as unknown as IconNode, label: "自行车" },
  guitar: { node: Guitar as unknown as IconNode, label: "吉他" },
  pizza: { node: Pizza as unknown as IconNode, label: "披萨" },
  plane: { node: Plane as unknown as IconNode, label: "飞机" },
  trophy: { node: Trophy as unknown as IconNode, label: "奖杯" },
  tree: { node: TreePine as unknown as IconNode, label: "树" },
  umbrella: { node: Umbrella as unknown as IconNode, label: "雨伞" },
} satisfies Record<string, { node: IconNode; label: string }>;

type IconKey = keyof typeof ICONS;
const ICON_KEYS = Object.keys(ICONS);
const TILE_BACKGROUNDS = ["#edf2f8", "#eef4ee", "#f5f0eb", "#f0eef8", "#eef4f5"];

function iconFor(key: string): { node: IconNode; label: string } {
  return ICONS[key as IconKey] ?? ICONS.cat;
}

function shuffle<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = randomInt(0, index + 1);
    const current = values[index];
    const other = values[swap];
    if (current !== undefined && other !== undefined) {
      values[index] = other;
      values[swap] = current;
    }
  }
  return values;
}

function iconNodeSvg(node: IconNode, color: string): string {
  return node
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .map(([key, value]) => `${key}="${String(value).replaceAll('"', "&quot;")}"`)
        .join(" ");
      return `<${tag} ${attributes} />`;
    })
    .join("");
}

export function createGrid(preview = false): GridState {
  const targetKey = preview
    ? "trophy"
    : (ICON_KEYS[randomInt(0, ICON_KEYS.length)] ?? "cat");
  const targetCount = preview ? 2 : randomInt(2, 5);
  const items = Array.from({ length: targetCount }, () => targetKey);
  const distractors = ICON_KEYS.filter((key) => key !== targetKey);
  shuffle(distractors);

  for (let index = items.length; index < 9; index += 1) {
    items.push(distractors[index % distractors.length] ?? "dog");
  }
  shuffle(items);

  const targetIndices = items
    .map((key, index) => (key === targetKey ? index : -1))
    .filter((index) => index >= 0);

  return {
    itemKeys: items,
    targetKey,
    targetName: iconFor(targetKey).label,
    targetIndices,
  };
}

export function renderGridItemSvg(itemKey: string, index: number): string {
  const icon = iconFor(itemKey);
  const background = TILE_BACKGROUNDS[index % TILE_BACKGROUNDS.length] ?? "#edf2f8";
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="选项图标">',
    `<rect width="24" height="24" rx="3" fill="${background}" />`,
    `<g transform="translate(4 4) scale(.6667)" fill="none" stroke="#172033" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">`,
    iconNodeSvg(icon.node, "#172033"),
    "</g></svg>",
  ].join("");
}

export function renderTargetSvg(targetKey: string): string {
  const icon = iconFor(targetKey);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="目标图标">',
    '<rect width="24" height="24" rx="3" fill="#eaf1ff" />',
    '<g transform="translate(4 4) scale(.6667)" fill="none" stroke="#2f6fed" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
    iconNodeSvg(icon.node, "#2f6fed"),
    "</g></svg>",
  ].join("");
}
