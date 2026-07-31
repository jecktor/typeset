import type { Frame } from '../core';

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

/** Screen-space rectangle: y is the TOP edge in page points. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_ELEMENT_SIZE = 6;

/** Resolve a frame (which may be bottom-anchored) to a top-based rect. */
export function frameToRect(frame: Frame, pageHeight: number): Rect {
  return {
    x: frame.x,
    y: frame.anchor === 'bottom' ? pageHeight - frame.y - frame.height : frame.y,
    width: frame.width,
    height: frame.height
  };
}

/** Convert a top-based rect back to a frame, preserving its anchor mode. */
export function rectToFrame(
  rect: Rect,
  anchor: Frame['anchor'],
  pageHeight: number
): Frame {
  return {
    x: rect.x,
    y: anchor === 'bottom' ? pageHeight - rect.y - rect.height : rect.y,
    width: rect.width,
    height: rect.height,
    ...(anchor ? { anchor } : {})
  };
}

export function applyMove(
  original: Frame,
  dx: number,
  dy: number,
  pageWidth: number,
  pageHeight: number
): Frame {
  const rect = frameToRect(original, pageHeight);
  const moved: Rect = {
    ...rect,
    x: Math.min(Math.max(0, rect.x + dx), Math.max(0, pageWidth - rect.width)),
    y: Math.min(Math.max(0, rect.y + dy), Math.max(0, pageHeight - rect.height))
  };
  return rectToFrame(moved, original.anchor, pageHeight);
}

/**
 * Corner resize, ported from documentDesigner's useInteraction corner switch.
 * Returns null when the result would go below the minimum size (the caller
 * keeps the last valid frame, matching the original editor's behavior).
 */
export const SNAP_THRESHOLD = 4;

export interface SnapResult {
  rect: Rect;
  guidesX: number[];
  guidesY: number[];
}

function snapValue(
  value: number,
  candidates: number[],
  threshold: number
): number | null {
  let best: number | null = null;
  let bestDelta = threshold;
  for (const c of candidates) {
    const d = Math.abs(value - c);
    if (d <= bestDelta) {
      bestDelta = d;
      best = c;
    }
  }
  return best;
}

/**
 * Snap a moving rect's edges and center to page edges/center and to other
 * elements' edges/centers. Returns the adjusted rect plus the guide lines
 * (in page points) that produced a snap, for the canvas to draw.
 */
export function snapMovingRect(
  rect: Rect,
  targets: Rect[],
  pageWidth: number,
  pageHeight: number,
  threshold = SNAP_THRESHOLD
): SnapResult {
  const xCandidates = [0, pageWidth, pageWidth / 2];
  const yCandidates = [0, pageHeight, pageHeight / 2];
  for (const t of targets) {
    xCandidates.push(t.x, t.x + t.width, t.x + t.width / 2);
    yCandidates.push(t.y, t.y + t.height, t.y + t.height / 2);
  }

  const guidesX: number[] = [];
  const guidesY: number[] = [];
  let { x, y } = rect;

  const xEdges: Array<[number, (v: number) => number]> = [
    [rect.x, v => v],
    [rect.x + rect.width, v => v - rect.width],
    [rect.x + rect.width / 2, v => v - rect.width / 2]
  ];
  for (const [edge, apply] of xEdges) {
    const hit = snapValue(edge, xCandidates, threshold);
    if (hit !== null) {
      x = apply(hit);
      guidesX.push(hit);
      break;
    }
  }
  const yEdges: Array<[number, (v: number) => number]> = [
    [rect.y, v => v],
    [rect.y + rect.height, v => v - rect.height],
    [rect.y + rect.height / 2, v => v - rect.height / 2]
  ];
  for (const [edge, apply] of yEdges) {
    const hit = snapValue(edge, yCandidates, threshold);
    if (hit !== null) {
      y = apply(hit);
      guidesY.push(hit);
      break;
    }
  }

  return { rect: { ...rect, x, y }, guidesX, guidesY };
}

/** Snap only the edges a resize corner is dragging. */
export function snapResizingRect(
  rect: Rect,
  corner: ResizeCorner,
  targets: Rect[],
  pageWidth: number,
  pageHeight: number,
  threshold = SNAP_THRESHOLD
): SnapResult {
  const xCandidates = [0, pageWidth, pageWidth / 2];
  const yCandidates = [0, pageHeight, pageHeight / 2];
  for (const t of targets) {
    xCandidates.push(t.x, t.x + t.width);
    yCandidates.push(t.y, t.y + t.height);
  }
  const guidesX: number[] = [];
  const guidesY: number[] = [];
  let { x, y, width, height } = rect;

  const movesLeft = corner === 'nw' || corner === 'sw';
  const movesTop = corner === 'nw' || corner === 'ne';

  if (movesLeft) {
    const hit = snapValue(x, xCandidates, threshold);
    if (hit !== null && width + (x - hit) >= MIN_ELEMENT_SIZE) {
      width += x - hit;
      x = hit;
      guidesX.push(hit);
    }
  } else {
    const hit = snapValue(x + width, xCandidates, threshold);
    if (hit !== null && hit - x >= MIN_ELEMENT_SIZE) {
      width = hit - x;
      guidesX.push(hit);
    }
  }
  if (movesTop) {
    const hit = snapValue(y, yCandidates, threshold);
    if (hit !== null && height + (y - hit) >= MIN_ELEMENT_SIZE) {
      height += y - hit;
      y = hit;
      guidesY.push(hit);
    }
  } else {
    const hit = snapValue(y + height, yCandidates, threshold);
    if (hit !== null && hit - y >= MIN_ELEMENT_SIZE) {
      height = hit - y;
      guidesY.push(hit);
    }
  }

  return { rect: { x, y, width, height }, guidesX, guidesY };
}

export function applyResize(
  original: Frame,
  corner: ResizeCorner,
  dx: number,
  dy: number,
  pageHeight: number
): Frame | null {
  const r = frameToRect(original, pageHeight);
  let { x, y, width, height } = r;
  switch (corner) {
    case 'nw':
      x += dx;
      y += dy;
      width -= dx;
      height -= dy;
      break;
    case 'ne':
      y += dy;
      width += dx;
      height -= dy;
      break;
    case 'sw':
      x += dx;
      width -= dx;
      height += dy;
      break;
    case 'se':
      width += dx;
      height += dy;
      break;
  }
  if (width < MIN_ELEMENT_SIZE || height < MIN_ELEMENT_SIZE) return null;
  return rectToFrame({ x, y, width, height }, original.anchor, pageHeight);
}
