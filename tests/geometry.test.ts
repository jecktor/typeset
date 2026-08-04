import { describe, expect, it } from 'vitest';
import {
  alignRects,
  applyMove,
  applyResize,
  distributeRects,
  frameToRect,
  rectToFrame,
  snapMovingRect,
  snapResizingRect
} from '../src/editor/geometry';

const PAGE_W = 612;
const PAGE_H = 792;

describe('frame ↔ rect conversion', () => {
  it('is identity for top-anchored frames', () => {
    const frame = { x: 10, y: 20, width: 100, height: 30 };
    const rect = frameToRect(frame, PAGE_H);
    expect(rect).toEqual({ x: 10, y: 20, width: 100, height: 30 });
    expect(rectToFrame(rect, undefined, PAGE_H)).toEqual(frame);
  });

  it('round-trips bottom-anchored frames', () => {
    const frame = { x: 56, y: 85, width: 500, height: 40, anchor: 'bottom' as const };
    const rect = frameToRect(frame, PAGE_H);
    expect(rect.y).toBe(PAGE_H - 85 - 40);
    expect(rectToFrame(rect, 'bottom', PAGE_H)).toEqual(frame);
  });
});

describe('applyMove', () => {
  it('moves and clamps within the page', () => {
    const frame = { x: 10, y: 10, width: 100, height: 20 };
    expect(applyMove(frame, 5, 7, PAGE_W, PAGE_H)).toEqual({ x: 15, y: 17, width: 100, height: 20 });
    expect(applyMove(frame, -50, -50, PAGE_W, PAGE_H)).toEqual({ x: 0, y: 0, width: 100, height: 20 });
    expect(applyMove(frame, 9999, 9999, PAGE_W, PAGE_H)).toEqual({ x: PAGE_W - 100, y: PAGE_H - 20, width: 100, height: 20 });
  });

  it('keeps bottom anchoring while moving', () => {
    const frame = { x: 10, y: 85, width: 100, height: 20, anchor: 'bottom' as const };
    const moved = applyMove(frame, 0, -10, PAGE_W, PAGE_H);
    // Moving UP visually increases the distance from the bottom edge.
    expect(moved.anchor).toBe('bottom');
    expect(moved.y).toBe(95);
  });
});

describe('applyResize', () => {
  const frame = { x: 100, y: 100, width: 80, height: 40 };

  it('resizes from each corner', () => {
    expect(applyResize(frame, 'se', 10, 6, PAGE_H)).toEqual({ x: 100, y: 100, width: 90, height: 46 });
    expect(applyResize(frame, 'nw', 10, 6, PAGE_H)).toEqual({ x: 110, y: 106, width: 70, height: 34 });
    expect(applyResize(frame, 'ne', 10, 6, PAGE_H)).toEqual({ x: 100, y: 106, width: 90, height: 34 });
    expect(applyResize(frame, 'sw', 10, 6, PAGE_H)).toEqual({ x: 110, y: 100, width: 70, height: 46 });
  });

  it('rejects results below the minimum size', () => {
    expect(applyResize(frame, 'se', -79, 0, PAGE_H)).toBeNull();
    expect(applyResize(frame, 'se', 0, -39, PAGE_H)).toBeNull();
  });
});

describe('snapMovingRect', () => {
  const target = { x: 100, y: 200, width: 80, height: 20 };

  it('snaps a left edge to another element left edge within threshold', () => {
    const moving = { x: 103, y: 300, width: 50, height: 10 };
    const { rect, guidesX } = snapMovingRect(moving, [target], PAGE_W, PAGE_H);
    expect(rect.x).toBe(100);
    expect(guidesX).toEqual([100]);
  });

  it('snaps to the page horizontal center', () => {
    const moving = { x: PAGE_W / 2 - 25 + 2, y: 50, width: 50, height: 10 };
    const { rect, guidesX } = snapMovingRect(moving, [], PAGE_W, PAGE_H);
    expect(rect.x + rect.width / 2).toBe(PAGE_W / 2);
    expect(guidesX).toEqual([PAGE_W / 2]);
  });

  it('does not snap outside the threshold', () => {
    const moving = { x: 110, y: 300, width: 50, height: 10 };
    const { rect, guidesX, guidesY } = snapMovingRect(moving, [target], PAGE_W, PAGE_H);
    expect(rect.x).toBe(110);
    expect(guidesX).toEqual([]);
    expect(guidesY).toEqual([]);
  });

  it('snaps y to another element top edge', () => {
    const moving = { x: 400, y: 198, width: 50, height: 10 };
    const { rect, guidesY } = snapMovingRect(moving, [target], PAGE_W, PAGE_H);
    expect(rect.y).toBe(200);
    expect(guidesY).toEqual([200]);
  });
});

describe('snapResizingRect', () => {
  const target = { x: 100, y: 200, width: 80, height: 20 };

  it('snaps only the dragged edges (se → right/bottom)', () => {
    const rect = { x: 50, y: 100, width: 127, height: 118 }; // right=177≈180, bottom=218≈220
    const snapped = snapResizingRect(rect, 'se', [target], PAGE_W, PAGE_H);
    expect(snapped.rect.x).toBe(50);
    expect(snapped.rect.width).toBe(130); // right edge snapped to 180
    expect(snapped.rect.height).toBe(120); // bottom edge snapped to 220
  });

  it('never snaps below the minimum size', () => {
    const rect = { x: 96, y: 100, width: 7, height: 50 }; // left near 100 but would shrink to 3
    const snapped = snapResizingRect(rect, 'nw', [target], PAGE_W, PAGE_H);
    expect(snapped.rect.width).toBe(7);
  });
});

describe('alignRects', () => {
  const a = { x: 10, y: 10, width: 20, height: 10 };
  const b = { x: 50, y: 40, width: 40, height: 20 };
  const c = { x: 30, y: 80, width: 10, height: 30 };

  it('aligns left/right/center against the selection bounding box', () => {
    expect(alignRects([a, b, c], 'left').map(r => r.x)).toEqual([10, 10, 10]);
    expect(alignRects([a, b, c], 'right').map(r => r.x)).toEqual([70, 50, 80]);
    // bbox spans x 10..90 → center 50
    expect(alignRects([a, b, c], 'center').map(r => r.x)).toEqual([40, 30, 45]);
  });

  it('aligns top/bottom/middle against the selection bounding box', () => {
    expect(alignRects([a, b, c], 'top').map(r => r.y)).toEqual([10, 10, 10]);
    expect(alignRects([a, b, c], 'bottom').map(r => r.y)).toEqual([100, 90, 80]);
    // bbox spans y 10..110 → middle 60
    expect(alignRects([a, b, c], 'middle').map(r => r.y)).toEqual([55, 50, 45]);
  });

  it('is a no-op for fewer than 2 rects', () => {
    expect(alignRects([a], 'left')).toEqual([a]);
  });
});

describe('distributeRects', () => {
  it('equalizes gaps keeping the outermost rects in place', () => {
    const rects = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 12, y: 0, width: 10, height: 10 },
      { x: 90, y: 0, width: 10, height: 10 }
    ];
    const out = distributeRects(rects, 'h');
    // span 0..100, content 30 → gap (100-30)/2 = 35
    expect(out.map(r => r.x)).toEqual([0, 45, 90]);
  });

  it('sorts by position but preserves input order in the result', () => {
    const rects = [
      { x: 90, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 12, y: 0, width: 10, height: 10 }
    ];
    const out = distributeRects(rects, 'h');
    expect(out.map(r => r.x)).toEqual([90, 0, 45]);
  });

  it('distributes vertically', () => {
    const rects = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 11, width: 10, height: 20 },
      { x: 0, y: 70, width: 10, height: 10 }
    ];
    const out = distributeRects(rects, 'v');
    // span 0..80, content 40 → gap 20 → middle starts at 30
    expect(out.map(r => r.y)).toEqual([0, 30, 70]);
  });

  it('is a no-op for fewer than 3 rects', () => {
    const two = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 50, y: 0, width: 10, height: 10 }
    ];
    expect(distributeRects(two, 'h')).toEqual(two);
  });
});
