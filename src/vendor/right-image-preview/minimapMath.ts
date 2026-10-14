/**
 * Coordinate transforms for the navigation minimap.
 * Must stay in sync with {@link useImageTransform} CSS order:
 * translate(tx,ty) rotate(r) flip scale(s), transform-origin center.
 *
 * @see docs/minimap.md — pointer lifecycle (WebView) and Jacobian-based drag (rotation).
 * Jacobian step: `MINIMAP_JACOBIAN_EPS` in `imagePreviewTuning.ts`.
 */

import { MINIMAP_JACOBIAN_EPS } from './imagePreviewTuning';

export interface MinimapTransformParams {
  cw: number;
  ch: number;
  nw: number;
  nh: number;
  scale: number;
  tx: number;
  ty: number;
  rotationDeg: number;
  flipH: boolean;
  flipV: boolean;
}

function layoutImageTopLeft(cw: number, ch: number, nw: number, nh: number): { ix: number; iy: number } {
  return { ix: (cw - nw) / 2, iy: (ch - nh) / 2 };
}

/** Container pixel (top-left origin) → natural image pixel (top-left origin). */
export function containerToNatural(
  cx: number,
  cy: number,
  p: MinimapTransformParams,
): { nx: number; ny: number } {
  const { cw, ch, nw, nh, scale: s, tx, ty, rotationDeg, flipH, flipV } = p;
  const { ix, iy } = layoutImageTopLeft(cw, ch, nw, nh);
  const px = cx - ix - nw / 2 - tx;
  const py = cy - iy - nh / 2 - ty;
  const irad = (-rotationDeg * Math.PI) / 180;
  const iwx = px * Math.cos(irad) - py * Math.sin(irad);
  const iwy = px * Math.sin(irad) + py * Math.cos(irad);
  const wx = flipH ? -iwx : iwx;
  const wy = flipV ? -iwy : iwy;
  const vx = wx / s;
  const vy = wy / s;
  return { nx: vx + nw / 2, ny: vy + nh / 2 };
}

/** Natural image pixel → container pixel. */
export function naturalToContainer(
  nx: number,
  ny: number,
  p: MinimapTransformParams,
): { cx: number; cy: number } {
  const { cw, ch, nw, nh, scale: s, tx, ty, rotationDeg, flipH, flipV } = p;
  const { ix, iy } = layoutImageTopLeft(cw, ch, nw, nh);
  const vx = nx - nw / 2;
  const vy = ny - nh / 2;
  const wsx = vx * s;
  const wsy = vy * s;
  const wx = flipH ? -wsx : wsx;
  const wy = flipV ? -wsy : wsy;
  const rad = (rotationDeg * Math.PI) / 180;
  const xr = wx * Math.cos(rad) - wy * Math.sin(rad);
  const yr = wx * Math.sin(rad) + wy * Math.cos(rad);
  return {
    cx: ix + nw / 2 + xr + tx,
    cy: iy + nh / 2 + yr + ty,
  };
}

/**
 * Container translate `(tx, ty)` so that natural `(nx, ny)` lies at the viewport centre `(cw/2, ch/2)`.
 * Uses the same layout as {@link naturalToContainer} with `tx = ty = 0` for the baseline position.
 */
export function translateForViewportCentreOnNatural(
  nx: number,
  ny: number,
  p: MinimapTransformParams,
): { tx: number; ty: number } {
  const { cw, ch } = p;
  const { cx: bx, cy: by } = naturalToContainer(nx, ny, { ...p, tx: 0, ty: 0 });
  return { tx: cw / 2 - bx, ty: ch / 2 - by };
}

/** Natural → minimap inner pixel (same transform chain as main but scale = thumbS, tx = ty = 0). */
export function naturalToMinimapInner(
  nx: number,
  ny: number,
  mi: number,
  mj: number,
  nw: number,
  nh: number,
  thumbS: number,
  rotationDeg: number,
  flipH: boolean,
  flipV: boolean,
): { mx: number; my: number } {
  const { ix, iy } = layoutImageTopLeft(mi, mj, nw, nh);
  const vx = nx - nw / 2;
  const vy = ny - nh / 2;
  const wsx = vx * thumbS;
  const wsy = vy * thumbS;
  const wx = flipH ? -wsx : wsx;
  const wy = flipV ? -wsy : wsy;
  const rad = (rotationDeg * Math.PI) / 180;
  const xr = wx * Math.cos(rad) - wy * Math.sin(rad);
  const yr = wx * Math.sin(rad) + wy * Math.cos(rad);
  return {
    mx: ix + nw / 2 + xr,
    my: iy + nh / 2 + yr,
  };
}

/** Minimap inner pixel → natural image pixel (inverse of {@link naturalToMinimapInner}). */
export function minimapInnerToNatural(
  mx: number,
  my: number,
  inner: number,
  nw: number,
  nh: number,
  thumbS: number,
  rotationDeg: number,
  flipH: boolean,
  flipV: boolean,
): { nx: number; ny: number } {
  const { ix, iy } = layoutImageTopLeft(inner, inner, nw, nh);
  const px = mx - ix - nw / 2;
  const py = my - iy - nh / 2;
  const irad = (-rotationDeg * Math.PI) / 180;
  const iwx = px * Math.cos(irad) - py * Math.sin(irad);
  const iwy = px * Math.sin(irad) + py * Math.cos(irad);
  const wx = flipH ? -iwx : iwx;
  const wy = flipV ? -iwy : iwy;
  const vx = wx / thumbS;
  const vy = wy / thumbS;
  return clampNatural(vx + nw / 2, vy + nh / 2, nw, nh);
}

/** Bounding box (half-width, half-height) of rotated unscaled rectangle. */
export function rotatedRectExtents(nw: number, nh: number, rotationDeg: number): { rw: number; rh: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const rw = Math.abs(nw * Math.cos(rad)) + Math.abs(nh * Math.sin(rad));
  const rh = Math.abs(nw * Math.sin(rad)) + Math.abs(nh * Math.cos(rad));
  return { rw, rh };
}

export function clampNatural(nx: number, ny: number, nw: number, nh: number): { nx: number; ny: number } {
  return {
    nx: Math.max(0, Math.min(nw, nx)),
    ny: Math.max(0, Math.min(nh, ny)),
  };
}

/** Winding-number test: whether `(x, y)` lies inside a simple closed polygon (vertex indices wrap). */
export function pointInPolygon(
  x: number,
  y: number,
  poly: ReadonlyArray<readonly [number, number]>,
): boolean {
  let wn = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [xa, ya] = poly[i]!;
    const [xb, yb] = poly[(i + 1) % n]!;
    if (ya <= y) {
      if (yb > y) {
        const v = (xb - xa) * (y - ya) - (x - xa) * (yb - ya);
        if (v > 0) wn++;
      }
    } else if (yb <= y) {
      const v = (xb - xa) * (y - ya) - (x - xa) * (yb - ya);
      if (v < 0) wn--;
    }
  }
  return wn !== 0;
}

/** Maps viewport centre (container space) to minimap inner pixels. Intentionally unclamped so ∂m/∂t stays smooth at edges. */
function viewportCentreOnMinimap(
  p: MinimapTransformParams,
  nw: number,
  nh: number,
  inner: number,
  thumbS: number,
): { mx: number; my: number } {
  const { nx, ny } = containerToNatural(p.cw / 2, p.ch / 2, p);
  return naturalToMinimapInner(nx, ny, inner, inner, nw, nh, thumbS, p.rotationDeg, p.flipH, p.flipV);
}

/**
 * Convert a pointer delta `(dmx, dmy)` in minimap / client space into container translate `(dtx, dty)` so the
 * viewport centre on the minimap follows the pointer 1:1.
 *
 * **Why not `cw / bw`?**  `bw` from the viewport quad’s axis-aligned box collapses when the quad is rotated,
 * which over-estimates pan gain. Here `J = ∂(mx,my)/∂(tx,ty)` is estimated numerically; then
 * `(dtx,dty) = J^{-1}(dmx,dmy)`.
 */
export function panDeltaFromMinimapPointerDelta(
  dmx: number,
  dmy: number,
  p: MinimapTransformParams,
  nw: number,
  nh: number,
  inner: number,
  thumbS: number,
): { dtx: number; dty: number } {
  const eps = MINIMAP_JACOBIAN_EPS;
  const m0 = viewportCentreOnMinimap(p, nw, nh, inner, thumbS);
  const mTx = viewportCentreOnMinimap({ ...p, tx: p.tx + eps }, nw, nh, inner, thumbS);
  const mTy = viewportCentreOnMinimap({ ...p, ty: p.ty + eps }, nw, nh, inner, thumbS);
  const j11 = (mTx.mx - m0.mx) / eps;
  const j21 = (mTx.my - m0.my) / eps;
  const j12 = (mTy.mx - m0.mx) / eps;
  const j22 = (mTy.my - m0.my) / eps;
  const det = j11 * j22 - j12 * j21;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) {
    const { scale: s } = p;
    const k = Number.isFinite(s) && s > 0 && Number.isFinite(thumbS) && thumbS > 0 ? s / thumbS : 1;
    return { dtx: -dmx * k, dty: -dmy * k };
  }
  const inv11 = j22 / det;
  const inv12 = -j12 / det;
  const inv21 = -j21 / det;
  const inv22 = j11 / det;
  return {
    dtx: inv11 * dmx + inv12 * dmy,
    dty: inv21 * dmx + inv22 * dmy,
  };
}
