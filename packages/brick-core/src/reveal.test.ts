import { describe, expect, it } from "vitest";
import { brickProgress, easeOutCubic, revealOrder, revealTiming, visibleCount } from "./reveal";
import type { Brick } from "./grid";

function brick(id: string, x: number, y: number, z: number): Brick {
  return { id, part: "3001", color: 4, x, y, z, rot: 0, by: "t" };
}

describe("revealOrder", () => {
  it("builds from the bottom layer up", () => {
    const order = revealOrder([
      brick("high", 0, 6, 0),
      brick("low", 0, 0, 0),
      brick("mid", 0, 3, 0),
    ]);
    expect(order.map((b) => b.id)).toEqual(["low", "mid", "high"]);
  });

  it("goes front to back within a layer", () => {
    const order = revealOrder([brick("back", 0, 0, 5), brick("front", 0, 0, 1)]);
    expect(order.map((b) => b.id)).toEqual(["front", "back"]);
  });

  it("goes left to right within a row", () => {
    const order = revealOrder([brick("right", 7, 0, 0), brick("left", 2, 0, 0)]);
    expect(order.map((b) => b.id)).toEqual(["left", "right"]);
  });

  it("is a total order — identical positions still never tie", () => {
    const order = revealOrder([brick("bbb", 0, 0, 0), brick("aaa", 0, 0, 0)]);
    expect(order.map((b) => b.id)).toEqual(["aaa", "bbb"]);
  });

  it("gives the same sequence whatever order the bricks arrive in", () => {
    const bricks = [
      brick("a", 1, 3, 2),
      brick("b", 0, 0, 0),
      brick("c", 4, 3, 1),
      brick("d", 2, 0, 9),
    ];
    const expected = revealOrder(bricks).map((b) => b.id);
    expect(revealOrder([...bricks].reverse()).map((b) => b.id)).toEqual(expected);
    expect(revealOrder([bricks[2]!, bricks[0]!, bricks[3]!, bricks[1]!]).map((b) => b.id)).toEqual(
      expected,
    );
  });

  it("does not mutate its input", () => {
    const bricks = [brick("z", 0, 9, 0), brick("a", 0, 0, 0)];
    revealOrder(bricks);
    expect(bricks.map((b) => b.id)).toEqual(["z", "a"]);
  });

  it("handles an empty build", () => {
    expect(revealOrder([])).toEqual([]);
  });
});

describe("revealTiming", () => {
  it("uses a leisurely stagger for a small build", () => {
    const timing = revealTiming(10);
    expect(timing.stagger).toBeCloseTo(0.07, 5);
    expect(timing.total).toBeGreaterThan(0);
  });

  it("compresses so a huge build still finishes in reasonable time", () => {
    const timing = revealTiming(2000);
    expect(timing.total).toBeLessThanOrEqual(13);
    expect(timing.stagger).toBeLessThan(0.07);
  });

  it("never staggers below the floor, however many bricks", () => {
    expect(revealTiming(1_000_000).stagger).toBeGreaterThanOrEqual(0.004);
  });

  it("keeps the stagger shrinking as the build grows", () => {
    expect(revealTiming(500).stagger).toBeLessThan(revealTiming(100).stagger);
    expect(revealTiming(2000).stagger).toBeLessThan(revealTiming(500).stagger);
  });

  it("gives an empty build zero duration", () => {
    expect(revealTiming(0).total).toBe(0);
  });

  it("gives a single brick exactly one drop", () => {
    const timing = revealTiming(1);
    expect(timing.total).toBeCloseTo(timing.brickDuration, 5);
  });
});

describe("brickProgress", () => {
  const timing = revealTiming(10);

  it("is 0 before the brick's turn", () => {
    expect(brickProgress(5, 0, timing)).toBe(0);
  });

  it("is 1 once the brick has landed", () => {
    expect(brickProgress(0, 99, timing)).toBe(1);
  });

  it("rises monotonically through the drop", () => {
    const start = 3 * timing.stagger;
    const a = brickProgress(3, start + 0.1, timing);
    const b = brickProgress(3, start + 0.2, timing);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(1);
  });

  it("every brick has landed by the reported total", () => {
    const count = 25;
    const t = revealTiming(count);
    for (let i = 0; i < count; i++) {
      expect(brickProgress(i, t.total, t)).toBe(1);
    }
  });
});

describe("visibleCount", () => {
  const timing = revealTiming(10);

  it("shows the first brick immediately", () => {
    expect(visibleCount(0, 10, timing)).toBe(1);
  });

  it("never exceeds the brick count", () => {
    expect(visibleCount(9999, 10, timing)).toBe(10);
  });

  it("grows as time passes", () => {
    expect(visibleCount(timing.stagger * 4.5, 10, timing)).toBe(5);
  });

  it("is 0 for an empty build", () => {
    expect(visibleCount(5, 0, timing)).toBe(0);
  });
});

describe("easeOutCubic", () => {
  it("pins the ends", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("clamps out-of-range input", () => {
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeOutCubic(7)).toBe(1);
  });

  it("eases out — more than half the distance covered by halfway", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
