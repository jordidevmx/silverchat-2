import {
  SUPPORTED_CLIPBOARD_IMAGE_EXTENSIONS,
  SUPPORTED_CLIPBOARD_IMAGE_MIMES,
} from "./clipboard-images.ts";

export const PRESET_BACKGROUNDS = ["aurora", "dusk", "nebula"] as const;
export type PresetBackground = (typeof PRESET_BACKGROUNDS)[number];

export const PRESET_BACKGROUND_LABELS: Readonly<Record<PresetBackground, string>> = {
  aurora: "Aurora",
  dusk: "Dusk",
  nebula: "Nebula",
};

export type ChatBackgroundSelection =
  | { kind: "default" }
  | { kind: "preset"; preset: PresetBackground }
  | { kind: "custom" };

export const BACKGROUND_SELECTIONS = ["default", ...PRESET_BACKGROUNDS, "custom"] as const;
export const BACKGROUND_DIM_STEPS = [
  "0",
  "10",
  "20",
  "30",
  "40",
  "50",
  "60",
  "70",
  "80",
  "90",
  "100",
] as const;
export const DEFAULT_BACKGROUND_DIM = "40";

export const MAX_BACKGROUND_IMAGE_BYTES = 10 * 1024 * 1024;

export function backgroundSelectionKey(ownerId: string): string {
  return `chat_background:${ownerId}`;
}

export function backgroundDimKey(ownerId: string): string {
  return `chat_background_dim:${ownerId}`;
}

export function resolveSelectionAfterCustomRemoval(
  selection: ChatBackgroundSelection,
): ChatBackgroundSelection {
  return selection.kind === "custom" ? { kind: "default" } : selection;
}

export type BackgroundImageErrorCode =
  | "unsupported-format"
  | "too-large"
  | "empty-file"
  | "unreadable"
  | "storage-unavailable";

export class BackgroundImageError extends Error {
  readonly code: BackgroundImageErrorCode;

  constructor(code: BackgroundImageErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.code = code;
    this.name = "BackgroundImageError";
  }
}

export function parseBackgroundSelection(value: string | null): ChatBackgroundSelection {
  if (value === "custom") return { kind: "custom" };
  if (value && PRESET_BACKGROUNDS.includes(value as PresetBackground))
    return { kind: "preset", preset: value as PresetBackground };
  return { kind: "default" };
}

export function parseBackgroundDim(value: string | null): number {
  if (value === null || value === "") return Number(DEFAULT_BACKGROUND_DIM);
  const parsed = Number(value);
  if (!BACKGROUND_DIM_STEPS.includes(String(parsed) as (typeof BACKGROUND_DIM_STEPS)[number]))
    return Number(DEFAULT_BACKGROUND_DIM);
  return parsed;
}

/** Metadata-only acceptance check; decode and compression happen in the provider. */
export function checkBackgroundImage(
  file: Pick<File, "name" | "type" | "size">,
): BackgroundImageErrorCode | null {
  if (file.size === 0) return "empty-file";
  if (file.size > MAX_BACKGROUND_IMAGE_BYTES) return "too-large";
  const mime = (file.type.split(";")[0] ?? "").trim().toLowerCase();
  if (SUPPORTED_CLIPBOARD_IMAGE_MIMES.has(mime)) return null;
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!mime && SUPPORTED_CLIPBOARD_IMAGE_EXTENSIONS.has(extension)) return null;
  return "unsupported-format";
}
