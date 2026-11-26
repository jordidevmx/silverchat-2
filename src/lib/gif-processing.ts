import { decodeFrames, encode } from "modern-gif";
import {
  type AnimatedGifInspection,
  AVATAR_GIF_POLICY,
  assertGifGuardrails,
  BACKGROUND_GIF_POLICY,
  computeFittedDimensions,
  type GifInspection,
  GifProcessingError,
  type GifSurfacePolicy,
  hasGifMagicBytes,
  inspectGifBuffer,
  isFullFrameSquareCrop,
  MEDIA_GIF_POLICY,
  normalizeFrameDelay,
  shouldFastPathGif,
  thinFramesByHalf,
} from "./gif-core.ts";

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DecodedGifFrame {
  width: number;
  height: number;
  delay: number;
  data: Uint8ClampedArray;
}

export interface ProcessedGif {
  file: File;
  width: number;
  height: number;
  reencoded: boolean;
}

export interface GifCodecAdapter {
  decodeFrames: (buffer: ArrayBuffer, workerUrl?: string) => Promise<DecodedGifFrame[]>;
  renderFrames: (
    frames: readonly DecodedGifFrame[],
    sourceCrop: CropArea,
    dstWidth: number,
    dstHeight: number,
    signal?: AbortSignal,
  ) => Array<{ data: Uint8ClampedArray; delay: number }>;
  encode: (opts: {
    width: number;
    height: number;
    maxColors: number;
    looped: boolean;
    loopCount: number;
    frames: Array<{ data: Uint8ClampedArray; delay: number }>;
    workerUrl?: string;
  }) => Promise<Uint8Array>;
}

let cachedWorkerUrlPromise: Promise<string | undefined> | null = null;

async function resolveBrowserWorkerUrl(): Promise<string | undefined> {
  if (typeof Worker === "undefined") return undefined;
  if (!cachedWorkerUrlPromise) {
    cachedWorkerUrlPromise = import("./gif-worker.ts")
      .then((mod) => mod.getGifWorkerUrl())
      .catch(() => undefined);
  }
  return await cachedWorkerUrlPromise;
}

function clampCropArea(area: CropArea, srcWidth: number, srcHeight: number): CropArea {
  const x = Math.max(0, Math.min(srcWidth - 1, Math.round(area.x)));
  const y = Math.max(0, Math.min(srcHeight - 1, Math.round(area.y)));
  const width = Math.max(1, Math.min(srcWidth - x, Math.round(area.width)));
  const height = Math.max(1, Math.min(srcHeight - y, Math.round(area.height)));
  return { x, y, width, height };
}

function defaultRenderFrames(
  frames: readonly DecodedGifFrame[],
  sourceCrop: CropArea,
  dstWidth: number,
  dstHeight: number,
  signal?: AbortSignal,
): Array<{ data: Uint8ClampedArray; delay: number }> {
  if (typeof document === "undefined") {
    throw new GifProcessingError("unreadable");
  }
  const srcCanvas = document.createElement("canvas");
  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = dstWidth;
  dstCanvas.height = dstHeight;
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const dstCtx = dstCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx || !dstCtx) {
    throw new GifProcessingError("unreadable");
  }
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = "high";

  try {
    const rendered: Array<{ data: Uint8ClampedArray; delay: number }> = [];
    for (const frame of frames) {
      signal?.throwIfAborted();
      if (srcCanvas.width !== frame.width || srcCanvas.height !== frame.height) {
        srcCanvas.width = frame.width;
        srcCanvas.height = frame.height;
      }
      const crop = clampCropArea(sourceCrop, frame.width, frame.height);
      const imageData = srcCtx.createImageData(frame.width, frame.height);
      imageData.data.set(frame.data);
      srcCtx.putImageData(imageData, 0, 0);

      dstCtx.clearRect(0, 0, dstWidth, dstHeight);
      dstCtx.drawImage(
        srcCanvas,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        dstWidth,
        dstHeight,
      );
      const out = dstCtx.getImageData(0, 0, dstWidth, dstHeight);
      rendered.push({
        data: out.data,
        delay: normalizeFrameDelay(frame.delay),
      });
    }
    return rendered;
  } finally {
    srcCanvas.width = 0;
    srcCanvas.height = 0;
    dstCanvas.width = 0;
    dstCanvas.height = 0;
  }
}

const defaultAdapter: GifCodecAdapter = {
  async decodeFrames(buffer, workerUrl) {
    if (workerUrl) {
      const workerFrames = await decodeFrames(buffer, { workerUrl });
      if (Array.isArray(workerFrames) && workerFrames.length > 0) {
        return workerFrames;
      }
    }
    return decodeFrames(buffer);
  },
  renderFrames: defaultRenderFrames,
  async encode(opts) {
    const buildOptions = (activeWorkerUrl?: string) => ({
      width: opts.width,
      height: opts.height,
      maxColors: opts.maxColors,
      looped: opts.looped,
      loopCount: opts.loopCount,
      workerUrl: activeWorkerUrl,
      format: "arrayBuffer" as const,
      frames: opts.frames.map((frame) => ({
        data: new Uint8ClampedArray(frame.data),
        delay: frame.delay,
      })),
    });

    if (opts.workerUrl) {
      const workerOutput = await encode(buildOptions(opts.workerUrl));
      if (workerOutput instanceof ArrayBuffer && workerOutput.byteLength > 0) {
        return new Uint8Array(workerOutput);
      }
    }
    const output = await encode(buildOptions(undefined));
    if (!(output instanceof ArrayBuffer) || output.byteLength === 0) {
      throw new GifProcessingError("unreadable");
    }
    return new Uint8Array(output);
  },
};

function gifFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim() || "animation";
  return `${base}.gif`;
}

export async function inspectGifFile(file: Blob): Promise<GifInspection> {
  if (file.size < 6) return { kind: "not-gif" };
  const header = new Uint8Array(await file.slice(0, 6).arrayBuffer());
  if (!hasGifMagicBytes(header)) return { kind: "not-gif" };
  const buffer = await file.arrayBuffer();
  return inspectGifBuffer(buffer);
}

async function resolveAnimatedInspection(
  file: Blob,
  existing?: AnimatedGifInspection,
): Promise<AnimatedGifInspection> {
  if (existing) return existing;
  const inspected = await inspectGifFile(file);
  if (inspected.kind !== "animated-gif") {
    throw new GifProcessingError("unreadable");
  }
  return inspected;
}

async function reencodeWithLadder(opts: {
  inspection: AnimatedGifInspection;
  crop: CropArea;
  policy: GifSurfacePolicy;
  filename: string;
  signal?: AbortSignal;
  adapter: GifCodecAdapter;
  useWorker: boolean;
}): Promise<ProcessedGif> {
  const { inspection, crop, policy, filename, signal, adapter, useWorker } = opts;
  signal?.throwIfAborted();
  const workerUrl = useWorker ? await resolveBrowserWorkerUrl() : undefined;

  let decoded: DecodedGifFrame[];
  try {
    decoded = await adapter.decodeFrames(inspection.buffer, workerUrl);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new GifProcessingError("unreadable", { cause });
  }
  if (!Array.isArray(decoded) || decoded.length === 0) {
    throw new GifProcessingError("unreadable");
  }
  signal?.throwIfAborted();

  let lastDimensionKey = "";
  let cachedRendered: Array<{ data: Uint8ClampedArray; delay: number }> = [];

  for (const rung of policy.ladder) {
    signal?.throwIfAborted();
    const { width, height } = computeFittedDimensions(crop.width, crop.height, rung.maxSide);
    const dimKey = `${width}x${height}`;
    if (dimKey !== lastDimensionKey) {
      cachedRendered = adapter.renderFrames(decoded, crop, width, height, signal);
      lastDimensionKey = dimKey;
    }
    const candidateFrames = rung.thinHalf ? thinFramesByHalf(cachedRendered) : cachedRendered;
    signal?.throwIfAborted();

    let encoded: Uint8Array;
    try {
      encoded = await adapter.encode({
        width,
        height,
        maxColors: rung.maxColors,
        looped: inspection.looped,
        loopCount: inspection.loopCount,
        frames: candidateFrames,
        workerUrl,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      throw new GifProcessingError("unreadable", { cause });
    }
    signal?.throwIfAborted();

    if (!(encoded instanceof Uint8Array) || encoded.byteLength === 0) {
      throw new GifProcessingError("unreadable");
    }

    if (encoded.byteLength <= policy.maxOutputBytes) {
      const outputBytes = new Uint8Array(encoded);
      return {
        file: new File([outputBytes], filename, { type: "image/gif" }),
        width,
        height,
        reencoded: true,
      };
    }
  }

  throw new GifProcessingError("compression-failed", {
    limitMB: Math.round(policy.maxOutputBytes / (1024 * 1024)),
  });
}

export async function processMediaGif(
  file: File,
  options?: {
    signal?: AbortSignal;
    inspection?: AnimatedGifInspection;
    adapter?: GifCodecAdapter;
  },
): Promise<ProcessedGif> {
  options?.signal?.throwIfAborted();
  const inspection = await resolveAnimatedInspection(file, options?.inspection);
  assertGifGuardrails(inspection, file.size, MEDIA_GIF_POLICY.maxInputBytes);

  const outputName = gifFilename(file.name);
  if (shouldFastPathGif(inspection, file.size, MEDIA_GIF_POLICY)) {
    const outFile =
      file.type === "image/gif" && file.name === outputName
        ? file
        : new File([inspection.buffer], outputName, { type: "image/gif" });
    return {
      file: outFile,
      width: inspection.width,
      height: inspection.height,
      reencoded: false,
    };
  }

  return await reencodeWithLadder({
    inspection,
    crop: { x: 0, y: 0, width: inspection.width, height: inspection.height },
    policy: MEDIA_GIF_POLICY,
    filename: outputName,
    signal: options?.signal,
    adapter: options?.adapter ?? defaultAdapter,
    useWorker: !options?.adapter,
  });
}

export async function processAvatarGif(
  file: File,
  area: CropArea,
  options?: {
    signal?: AbortSignal;
    inspection?: AnimatedGifInspection;
    filename?: string;
    adapter?: GifCodecAdapter;
  },
): Promise<ProcessedGif> {
  options?.signal?.throwIfAborted();
  const inspection = await resolveAnimatedInspection(file, options?.inspection);
  assertGifGuardrails(inspection, file.size, AVATAR_GIF_POLICY.maxInputBytes);

  const outputName = options?.filename ?? `avatar-${crypto.randomUUID()}.gif`;
  if (
    isFullFrameSquareCrop(inspection.width, inspection.height, area) &&
    inspection.width <= 256 &&
    file.size <= AVATAR_GIF_POLICY.maxOutputBytes
  ) {
    return {
      file: new File([inspection.buffer], outputName, { type: "image/gif" }),
      width: inspection.width,
      height: inspection.height,
      reencoded: false,
    };
  }

  const squareSize = Math.max(1, Math.min(area.width, area.height));
  const squareCrop: CropArea = {
    x: area.x,
    y: area.y,
    width: squareSize,
    height: squareSize,
  };

  return await reencodeWithLadder({
    inspection,
    crop: squareCrop,
    policy: AVATAR_GIF_POLICY,
    filename: outputName,
    signal: options?.signal,
    adapter: options?.adapter ?? defaultAdapter,
    useWorker: !options?.adapter,
  });
}

export async function processBackgroundGif(
  file: File,
  options?: {
    signal?: AbortSignal;
    inspection?: AnimatedGifInspection;
    adapter?: GifCodecAdapter;
  },
): Promise<ProcessedGif> {
  options?.signal?.throwIfAborted();
  const inspection = await resolveAnimatedInspection(file, options?.inspection);
  assertGifGuardrails(inspection, file.size, BACKGROUND_GIF_POLICY.maxInputBytes);

  const outputName = gifFilename(file.name);
  if (shouldFastPathGif(inspection, file.size, BACKGROUND_GIF_POLICY)) {
    const outFile =
      file.type === "image/gif" && file.name === outputName
        ? file
        : new File([inspection.buffer], outputName, { type: "image/gif" });
    return {
      file: outFile,
      width: inspection.width,
      height: inspection.height,
      reencoded: false,
    };
  }

  return await reencodeWithLadder({
    inspection,
    crop: { x: 0, y: 0, width: inspection.width, height: inspection.height },
    policy: BACKGROUND_GIF_POLICY,
    filename: outputName,
    signal: options?.signal,
    adapter: options?.adapter ?? defaultAdapter,
    useWorker: !options?.adapter,
  });
}
