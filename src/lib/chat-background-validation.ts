import {
  SUPPORTED_CLIPBOARD_IMAGE_EXTENSIONS,
  SUPPORTED_CLIPBOARD_IMAGE_MIMES,
} from "./clipboard-images.ts";

export const PRESET_BACKGROUNDS = ["mercury", "obsidian", "prism", "horizon"] as const;
export type PresetBackground = (typeof PRESET_BACKGROUNDS)[number];

export const PRESET_BACKGROUND_LABELS: Readonly<Record<PresetBackground, string>> = {
  mercury: "Mercury",
  obsidian: "Obsidian",
  prism: "Prism",
  horizon: "Horizon",
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

export function serializeBackgroundSelection(
  selection: ChatBackgroundSelection,
): (typeof BACKGROUND_SELECTIONS)[number] {
  return selection.kind === "preset" ? selection.preset : selection.kind;
}

const BACKGROUND_FILENAME_PATTERN = /^bg-[0-9a-f-]+\.webp$/;

export function isOwnBackgroundPath(
  ownerId: string,
  path: string | null | undefined,
): path is string {
  if (!ownerId || !path) return false;
  const parts = path.split("/");
  return (
    parts.length === 2 && parts[0] === ownerId && BACKGROUND_FILENAME_PATTERN.test(parts[1] ?? "")
  );
}

export interface RemoteBackgroundSettings {
  chat_background?: string | null;
  chat_background_dim?: number | null;
  chat_background_path?: string | null;
}

export interface ReconciledBackgroundState {
  selection: ChatBackgroundSelection;
  dim: number;
  customPath: string | null;
}

export function reconcileRemoteBackground(
  remote: RemoteBackgroundSettings,
  ownerId: string,
): ReconciledBackgroundState {
  const customPath = isOwnBackgroundPath(ownerId, remote.chat_background_path)
    ? remote.chat_background_path
    : null;
  const parsedSelection = parseBackgroundSelection(remote.chat_background ?? null);
  const selection: ChatBackgroundSelection =
    parsedSelection.kind === "custom" && !customPath ? { kind: "default" } : parsedSelection;
  const dim = parseBackgroundDim(
    remote.chat_background_dim === null || remote.chat_background_dim === undefined
      ? null
      : String(remote.chat_background_dim),
  );
  return { selection, dim, customPath };
}

export type BackgroundImageErrorCode =
  | "unsupported-format"
  | "too-large"
  | "empty-file"
  | "unreadable"
  | "storage-unavailable"
  | "sync-failed";

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
