import { describe, expect, test } from "bun:test";
import { assignCells, computeGridDims, computePaneBox, tooSmallForGrid } from "./gridLayout.ts";

describe("computeGridDims", () => {
  test("uses sensible splits for small counts", () => {
    expect(computeGridDims(1)).toEqual({ cols: 1, rows: 1 });
    expect(computeGridDims(2)).toEqual({ cols: 2, rows: 1 });
    expect(computeGridDims(4)).toEqual({ cols: 2, rows: 2 });
    expect(computeGridDims(6)).toEqual({ cols: 3, rows: 2 });
    expect(computeGridDims(9)).toEqual({ cols: 3, rows: 3 });
  });

  test("falls back to sqrt for larger counts", () => {
    expect(computeGridDims(12)).toEqual({ cols: 4, rows: 3 });
  });
});

describe("computePaneBox", () => {
  test("divides usable space and floors", () => {
    const box = computePaneBox(100, 30, { cols: 2, rows: 2 }, { header: 1, footer: 4 });
    // usableHeight = 30 - 1 - 4 = 25; /2 -> 12 ; width 100/2 -> 50
    expect(box).toEqual({ paneWidth: 50, paneHeight: 12 });
  });

  test("never returns negative height", () => {
    const box = computePaneBox(80, 3, { cols: 1, rows: 1 }, { header: 1, footer: 4 });
    expect(box.paneHeight).toBe(0);
  });
});

describe("assignCells", () => {
  test("places ids row-major and is stable", () => {
    const cells = assignCells(["a", "b", "c"], { cols: 2, rows: 2 });
    expect(cells).toEqual([
      { id: "a", row: 0, col: 0 },
      { id: "b", row: 0, col: 1 },
      { id: "c", row: 1, col: 0 },
    ]);
  });

  test("caps at grid capacity", () => {
    const cells = assignCells(["a", "b", "c", "d", "e"], { cols: 2, rows: 2 });
    expect(cells).toHaveLength(4);
  });
});

describe("tooSmallForGrid", () => {
  test("flags panes below the minimum", () => {
    expect(tooSmallForGrid(20, 10)).toBe(true);
    expect(tooSmallForGrid(40, 4)).toBe(true);
    expect(tooSmallForGrid(40, 10)).toBe(false);
  });
});
