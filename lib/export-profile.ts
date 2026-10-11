import type { PolicyItem } from "./policy";

export type ExportFormat = "short" | "detailed" | "structured";

const SECTIONS: { title: string; dimension: PolicyItem["dimension"] }[] = [
  { title: "MONEY", dimension: "cost" },
  { title: "REACHING OTHER PEOPLE", dimension: "exposure" },
  { title: "WHEN IT CAN'T BE UNDONE", dimension: "reversibility" },
  { title: "KEEPING ME IN THE LOOP", dimension: "notification" },
];

function sentence(text: string) {
  const clean = text.replace(/\.$/, "");
  return `${clean}.`;
}

export function buildShort(items: PolicyItem[]) {
  return ["HOW TO WORK WITH ME", "", ...items.map((item) => `- ${sentence(item.text)}`)].join("\n");
}

const MOVE_ORDER: Record<PolicyItem["move"], number> = { ask: 0, show: 1, modifier: 2, custom: 3, act: 4 };

export function buildDetailed(items: PolicyItem[]) {
  const lines = ["HOW TO WORK WITH ME", ""];
  for (const section of SECTIONS) {
    const group = items
      .filter((item) => item.dimension === section.dimension)
      .sort((a, b) => MOVE_ORDER[a.move] - MOVE_ORDER[b.move]);
    if (group.length === 0) continue;
    lines.push(section.title);
    lines.push(group.map((item) => sentence(item.text)).join(" "));
    lines.push("");
  }
  const custom = items.filter((item) => item.dimension === "custom");
  if (custom.length > 0) {
    lines.push("ALSO");
    lines.push(custom.map((item) => sentence(item.text)).join(" "));
  }
  return lines.join("\n").trim();
}

export function buildStructured(items: PolicyItem[]) {
  return {
    version: "0.1",
    generated_at: new Date().toISOString(),
    policies: items.map((item) => ({
      id: item.id,
      text: sentence(item.text).replace(/\.$/, ""),
      ...(item.when ? { when: item.when } : {}),
      ...(item.modifier && item.move === "modifier" ? { modifier: item.modifier } : { move: item.move === "show" ? "show_plan" : item.move }),
    })),
    default: { move: "ask" },
  };
}

export function buildExport(items: PolicyItem[], format: ExportFormat) {
  if (format === "detailed") return buildDetailed(items);
  if (format === "structured") return JSON.stringify(buildStructured(items), null, 2);
  return buildShort(items);
}

export function ruleMeta(source: "spoken" | "learned" | "corrected" | "history") {
  if (source === "spoken") return "you told me";
  if (source === "corrected") return "you corrected this";
  if (source === "history") return "from your history";
  return "learned · confirmed by you";
}
