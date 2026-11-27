// Pure responsive sizing and viewport-clamping geometry for the minimized
// floating video call window. Shared by pointer drag, keyboard arrow-key
// movement, single-tap enlarge, and viewport resize/orientation re-clamping.

export type FloatingWindowBreakpoint = "mobile" | "tablet" | "desktop";

export interface FloatingWindowSize {
  width: number;
  height: number;
  breakpoint: FloatingWindowBreakpoint;
}

export interface FloatingPosition {
  x: number;
  y: number;
}

export interface FloatingBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface FloatingBoundsInput {
  viewportWidth: number;
  viewportHeight: number;
  windowWidth: number;
  windowHeight: number;
  edgeMargin: number;
  insetTop?: number;
  insetRight?: number;
  insetBottom?: number;
  insetLeft?: number;
}

export type FloatingMoveDirection = "left" | "right" | "up" | "down";

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function parseInsetPx(raw: string | undefined): number {
  if (!raw) return 0;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function parseSafeAreaInsets(raw: {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}): SafeAreaInsets {
  return {
    top: parseInsetPx(raw.top),
    right: parseInsetPx(raw.right),
    bottom: parseInsetPx(raw.bottom),
    left: parseInsetPx(raw.left),
  };
}

export function getFloatingWindowSize(
  viewportWidth: number,
  expanded: boolean,
): FloatingWindowSize {
  if (viewportWidth >= 1024) {
    return expanded
      ? { width: 288, height: 180, breakpoint: "desktop" }
      : { width: 240, height: 150, breakpoint: "desktop" };
  }
  if (viewportWidth >= 700) {
    return expanded
      ? { width: 184, height: 246, breakpoint: "tablet" }
      : { width: 152, height: 204, breakpoint: "tablet" };
  }
  return expanded
    ? { width: 148, height: 206, breakpoint: "mobile" }
    : { width: 120, height: 168, breakpoint: "mobile" };
}

export function getFloatingDragBounds(input: FloatingBoundsInput): FloatingBounds {
  const minX = input.edgeMargin + (input.insetLeft ?? 0);
  const minY = input.edgeMargin + (input.insetTop ?? 0);
  const maxX = Math.max(
    minX,
    input.viewportWidth - input.windowWidth - input.edgeMargin - (input.insetRight ?? 0),
  );
  const maxY = Math.max(
    minY,
    input.viewportHeight - input.windowHeight - input.edgeMargin - (input.insetBottom ?? 0),
  );
  return { minX, maxX, minY, maxY };
}

export function clampFloatingPosition(
  pos: FloatingPosition,
  bounds: FloatingBounds,
): FloatingPosition {
  return {
    x: Math.round(Math.min(bounds.maxX, Math.max(bounds.minX, pos.x))),
    y: Math.round(Math.min(bounds.maxY, Math.max(bounds.minY, pos.y))),
  };
}

export function getInitialFloatingPosition(
  dragBounds: FloatingBounds,
  bottomNavClearance: number,
): FloatingPosition {
  return clampFloatingPosition(
    {
      x: dragBounds.maxX,
      y: dragBounds.maxY - Math.max(0, bottomNavClearance),
    },
    dragBounds,
  );
}

export function moveFloatingPositionByKey(
  pos: FloatingPosition,
  key: string,
  step: number,
  bounds: FloatingBounds,
): { position: FloatingPosition; direction: FloatingMoveDirection } | null {
  switch (key) {
    case "ArrowLeft":
      return {
        position: clampFloatingPosition({ x: pos.x - step, y: pos.y }, bounds),
        direction: "left",
      };
    case "ArrowRight":
      return {
        position: clampFloatingPosition({ x: pos.x + step, y: pos.y }, bounds),
        direction: "right",
      };
    case "ArrowUp":
      return {
        position: clampFloatingPosition({ x: pos.x, y: pos.y - step }, bounds),
        direction: "up",
      };
    case "ArrowDown":
      return {
        position: clampFloatingPosition({ x: pos.x, y: pos.y + step }, bounds),
        direction: "down",
      };
    default:
      return null;
  }
}
