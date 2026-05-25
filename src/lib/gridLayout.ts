/** Minimum usable pane size; below this we fall back to the compact list. */
export const MIN_PANE_WIDTH = 24;
export const MIN_PANE_HEIGHT = 6;

/** Hard cap on tiled panes; extra agents spill to the compact list. */
export const MAX_GRID_AGENTS = 9;

/** Rows reserved outside the grid: header bar + input box (3) + hint. */
export const HEADER_ROWS = 1;
export const FOOTER_ROWS = 4;

export type GridDims = { readonly cols: number; readonly rows: number };
export type PaneBox = { readonly paneWidth: number; readonly paneHeight: number };
export type Cell = { readonly id: string; readonly row: number; readonly col: number };

/** Chooses a column/row split for N tiled agents. */
export function computeGridDims(count: number): GridDims {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count <= 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  const cols = Math.ceil(Math.sqrt(count));
  return { cols, rows: Math.ceil(count / cols) };
}

/** Computes per-pane size from terminal dimensions and the grid split. */
export function computePaneBox(
  termWidth: number,
  termHeight: number,
  dims: GridDims,
  reserved: { header: number; footer: number } = { header: HEADER_ROWS, footer: FOOTER_ROWS },
): PaneBox {
  const usableHeight = Math.max(0, termHeight - reserved.header - reserved.footer);
  return {
    paneWidth: Math.floor(termWidth / dims.cols),
    paneHeight: Math.floor(usableHeight / dims.rows),
  };
}

/** Places agent ids into grid cells, row-major, preserving order. */
export function assignCells(ids: readonly string[], dims: GridDims): Cell[] {
  return ids.slice(0, dims.cols * dims.rows).map((id, i) => ({
    id,
    row: Math.floor(i / dims.cols),
    col: i % dims.cols,
  }));
}

/** True when a pane would be too small to render usefully. */
export function tooSmallForGrid(paneWidth: number, paneHeight: number): boolean {
  return paneWidth < MIN_PANE_WIDTH || paneHeight < MIN_PANE_HEIGHT;
}
