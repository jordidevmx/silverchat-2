import { decode } from "modern-gif";

export type GifErrorCode =
  | "empty-file"
  | "too-large"
  | "too-many-frames"
  | "dimensions-too-large"
  | "compression-failed"
  | "unreadable";

export class GifProcessingError extends Error {
  readonly code: GifErrorCode;
  readonly limitMB?: number;

  constructor(code: GifErrorCode, options?: { cause?: unknown; limitMB?: number }) {
    super(
      code === "compression-failed" && options?.limitMB
        ? `GIF could not be compressed below ${options.limitMB} MB. Try a shorter or smaller GIF.`
        : code === "too-large" && options?.limitMB
          ? `Choose a GIF smaller than ${options.limitMB} MB.`
          : code === "too-many-frames"
            ? "This GIF has too many frames to process. Try a shorter GIF."
            : code === "dimensions-too-large"
              ? "This GIF is too large in dimensions. Try a smaller GIF."
              : code === "empty-file"
                ? "That file is empty."
                : "This GIF could not be read. Try another file.",
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "GifProcessingError";
    this.code = code;
    this.limitMB = options?.limitMB;
  }
}

export interface GifCompressionRung {
  maxSide: number;
  maxColors: number;
  thinHalf?: boolean;
}

export interface GifSurfacePolicy {
  maxInputBytes: number;
  maxOutputBytes: number;
  fastPathMaxSide: number | null;
  ladder: readonly GifCompressionRung[];
}

export const GIF_MAX_DIMENSION = 4096;
export const GIF_MAX_PIXELS = 16_000_000;
export const GIF_MAX_FRAMES = 600;

export const MEDIA_GIF_POLICY: GifSurfacePolicy = {
  maxInputBytes: 25 * 1024 * 1024,
  maxOutputBytes: 10 * 1024 * 1024,
  fastPathMaxSide: 1280,
  ladder: [
    { maxSide: 1280, maxColors: 255 },
    { maxSide: 960, maxColors: 128 },
    { maxSide: 720, maxColors: 128 },
    { maxSide: 480, maxColors: 64 },
    { maxSide: 480, maxColors: 64, thinHalf: true },
  ],
};

export const AVATAR_GIF_POLICY: GifSurfacePolicy = {
  maxInputBytes: 20 * 1024 * 1024,
  maxOutputBytes: 2 * 1024 * 1024,
  fastPathMaxSide: null,
  ladder: [
    { maxSide: 256, maxColors: 255 },
    { maxSide: 256, maxColors: 128 },
    { maxSide: 192, maxColors: 128 },
    { maxSide: 192, maxColors: 64 },
    { maxSide: 160, maxColors: 64, thinHalf: true },
    { maxSide: 128, maxColors: 64, thinHalf: true },
  ],
};

export const BACKGROUND_GIF_POLICY: GifSurfacePolicy = {
  maxInputBytes: 10 * 1024 * 1024,
  maxOutputBytes: 5 * 1024 * 1024,
  fastPathMaxSide: 1920,
  ladder: [
    { maxSide: 1280, maxColors: 255 },
    { maxSide: 960, maxColors: 128 },
    { maxSide: 720, maxColors: 64 },
    { maxSide: 480, maxColors: 64, thinHalf: true },
  ],
};

export type GifInspection =
  | { kind: "not-gif" }
  | { kind: "static-gif"; width: number; height: number }
  | {
      kind: "animated-gif";
      width: number;
      height: number;
      frameCount: number;
      maxFrameWidth?: number;
      maxFrameHeight?: number;
      maxFramePixels?: number;
      looped: boolean;
      loopCount: number;
      buffer: ArrayBuffer;
    };

export type AnimatedGifInspection = Extract<GifInspection, { kind: "animated-gif" }>;

const GIF87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const GENERIC_BINARY_MIMES = new Set(["", "application/octet-stream", "binary/octet-stream"]);
const EXT_TO_IMAGE_MIME: Readonly<Record<string, string>> = {
  gif: "image/gif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
};

export function hasGifMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 6) return false;
  const matches87a = GIF87A.every((value, idx) => bytes[idx] === value);
  if (matches87a) return true;
  return GIF89A.every((value, idx) => bytes[idx] === value);
}

export function isGifCandidate(file: { name?: string; type?: string }): boolean {
  const mime = (file.type ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mime === "image/gif") return true;
  if (!GENERIC_BINARY_MIMES.has(mime)) return false;
  const ext = (file.name ?? "").split(".").at(-1)?.toLowerCase() ?? "";
  return ext === "gif";
}

export function ensureImageFileForCompression(file: File): File {
  const mime = (file.type ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mime.startsWith("image/")) return file;
  const ext = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const inferred = EXT_TO_IMAGE_MIME[ext] ?? "image/png";
  return new File([file], file.name, { type: inferred, lastModified: file.lastModified });
}

export function classifyUploadMediaType(file: {
  name?: string;
  type?: string;
}): "image" | "video" | "audio" | "file" {
  const mime = (file.type ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mime.startsWith("image/") || isGifCandidate(file)) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export function inspectGifBuffer(buffer: ArrayBuffer): GifInspection {
  if (!hasGifMagicBytes(new Uint8Array(buffer, 0, Math.min(6, buffer.byteLength)))) {
    return { kind: "not-gif" };
  }
  let parsed: ReturnType<typeof decode>;
  try {
    parsed = decode(buffer);
  } catch (cause) {
    throw new GifProcessingError("unreadable", { cause });
  }
  if (!parsed || parsed.width <= 0 || parsed.height <= 0 || !parsed.frames?.length) {
    throw new GifProcessingError("unreadable");
  }
  let maxFrameWidth = parsed.width;
  let maxFrameHeight = parsed.height;
  let maxFramePixels = parsed.width * parsed.height;
  for (const frame of parsed.frames) {
    if (!frame || frame.width <= 0 || frame.height <= 0) {
      throw new GifProcessingError("unreadable");
    }
    const right = Math.max(frame.width, (frame.left ?? 0) + frame.width);
    const bottom = Math.max(frame.height, (frame.top ?? 0) + frame.height);
    maxFrameWidth = Math.max(maxFrameWidth, right);
    maxFrameHeight = Math.max(maxFrameHeight, bottom);
    maxFramePixels = Math.max(maxFramePixels, frame.width * frame.height, right * bottom);
  }
  if (parsed.frames.length <= 1) {
    return { kind: "static-gif", width: parsed.width, height: parsed.height };
  }
  return {
    kind: "animated-gif",
    width: parsed.width,
    height: parsed.height,
    frameCount: parsed.frames.length,
    maxFrameWidth,
    maxFrameHeight,
    maxFramePixels,
    looped: parsed.looped ?? true,
    loopCount: parsed.loopCount ?? 0,
    buffer,
  };
}

export function assertGifGuardrails(
  inspection: Pick<
    AnimatedGifInspection,
    "width" | "height" | "frameCount" | "maxFrameWidth" | "maxFrameHeight" | "maxFramePixels"
  >,
  inputBytes: number,
  maxInputBytes: number,
): void {
  if (inputBytes <= 0) {
    throw new GifProcessingError("empty-file");
  }
  if (inputBytes > maxInputBytes) {
    throw new GifProcessingError("too-large", {
      limitMB: Math.round(maxInputBytes / (1024 * 1024)),
    });
  }
  const effectiveWidth = Math.max(inspection.width, inspection.maxFrameWidth ?? 0);
  const effectiveHeight = Math.max(inspection.height, inspection.maxFrameHeight ?? 0);
  const effectivePixels = Math.max(
    inspection.width * inspection.height,
    inspection.maxFramePixels ?? 0,
  );
  if (
    effectiveWidth > GIF_MAX_DIMENSION ||
    effectiveHeight > GIF_MAX_DIMENSION ||
    effectivePixels > GIF_MAX_PIXELS
  ) {
    throw new GifProcessingError("dimensions-too-large");
  }
  if (inspection.frameCount > GIF_MAX_FRAMES) {
    throw new GifProcessingError("too-many-frames");
  }
}

export function shouldFastPathGif(
  inspection: Pick<AnimatedGifInspection, "width" | "height">,
  inputBytes: number,
  policy: GifSurfacePolicy,
): boolean {
  if (policy.fastPathMaxSide === null) return false;
  return (
    inputBytes > 0 &&
    inputBytes <= policy.maxOutputBytes &&
    Math.max(inspection.width, inspection.height) <= policy.fastPathMaxSide
  );
}

export function computeFittedDimensions(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function normalizeFrameDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs) || delayMs <= 0) return 100;
  return Math.round(delayMs);
}

export function thinFramesByHalf<T extends { delay: number }>(frames: readonly T[]): T[] {
  if (frames.length <= 1) return [...frames];
  const result: T[] = [];
  for (let i = 0; i < frames.length; i += 2) {
    const kept = frames[i];
    if (!kept) continue;
    const dropped = frames[i + 1];
    const delay =
      normalizeFrameDelay(kept.delay) + (dropped ? normalizeFrameDelay(dropped.delay) : 0);
    result.push({ ...kept, delay });
  }
  return result;
}

export function isFullFrameSquareCrop(
  width: number,
  height: number,
  area: { x: number; y: number; width: number; height: number },
): boolean {
  if (width <= 0 || height <= 0 || width !== height) return false;
  return (
    Math.abs(area.x) <= 1 &&
    Math.abs(area.y) <= 1 &&
    Math.abs(area.width - width) <= 1 &&
    Math.abs(area.height - height) <= 1
  );
}

export function formatGifError(
  error: unknown,
  say: (en: string, es: string) => string,
): string | null {
  if (!(error instanceof GifProcessingError)) return null;
  switch (error.code) {
    case "empty-file":
      return say("That file is empty.", "Ese archivo está vacío.");
    case "too-large": {
      const limit = error.limitMB ?? 10;
      return say(`Choose a GIF smaller than ${limit} MB.`, `Elige un GIF menor a ${limit} MB.`);
    }
    case "compression-failed": {
      const limit = error.limitMB ?? 10;
      return say(
        `GIF could not be compressed below ${limit} MB. Try a shorter or smaller GIF.`,
        `No se pudo comprimir el GIF por debajo de ${limit} MB. Prueba con un GIF más corto o pequeño.`,
      );
    }
    case "too-many-frames":
      return say(
        "This GIF has too many frames to process. Try a shorter GIF.",
        "Este GIF tiene demasiados fotogramas para procesarse. Prueba con uno más corto.",
      );
    case "dimensions-too-large":
      return say(
        "This GIF is too large in dimensions. Try a smaller GIF.",
        "Las dimensiones de este GIF son demasiado grandes. Prueba con uno más pequeño.",
      );
    case "unreadable":
      return say(
        "This GIF could not be read. Try another file.",
        "No se pudo leer este GIF. Prueba con otro archivo.",
      );
  }
}
