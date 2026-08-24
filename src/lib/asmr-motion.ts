export type AsmrMotionMode = "kenburns" | "drift" | "breathe" | "still";

export type AsmrMotionFrame = {
  scale: number;
  panX: number;
  panY: number;
};

/**
 * Deterministic motion for a still image. Values are normalized so the same
 * scene behaves identically in the canvas preview and in the exported video.
 */
export function asmrMotionAt(
  timeSeconds: number,
  mode: AsmrMotionMode,
  strength = 35,
  speed = 1,
): AsmrMotionFrame {
  const amount = Math.max(0, Math.min(100, Number(strength) || 0)) / 100;
  const rate = Math.max(0.1, Math.min(3, Number(speed) || 1));
  const phase = ((Math.max(0, Number(timeSeconds) || 0) * rate) / 18) * Math.PI * 2;
  const wave = (Math.sin(phase) + 1) / 2;
  const slow = Math.sin(phase * 0.5);
  const gentle = Math.cos(phase * 0.7);

  if (mode === "still" || amount === 0) return { scale: 1, panX: 0, panY: 0 };
  if (mode === "drift") {
    return {
      scale: 1 + amount * 0.045,
      panX: slow * amount * 0.12,
      panY: gentle * amount * 0.055,
    };
  }
  if (mode === "breathe") {
    return {
      scale: 1 + amount * 0.055 * wave,
      panX: Math.sin(phase * 0.35) * amount * 0.018,
      panY: Math.cos(phase * 0.3) * amount * 0.012,
    };
  }

  // Ken Burns: slow push-in with a barely perceptible diagonal drift.
  return {
    scale: 1 + amount * 0.16 * wave,
    panX: (wave - 0.5) * amount * 0.09,
    panY: (0.5 - wave) * amount * 0.045,
  };
}

export type CoverRect = { x: number; y: number; width: number; height: number };

/** Calculate an object-fit: cover rectangle with normalized pan offsets. */
export function asmrCoverRect(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  scale = 1,
  panX = 0,
  panY = 0,
): CoverRect {
  const iw = Math.max(1, Number(imageWidth) || 1);
  const ih = Math.max(1, Number(imageHeight) || 1);
  const cw = Math.max(1, Number(canvasWidth) || 1);
  const ch = Math.max(1, Number(canvasHeight) || 1);
  const cover = Math.max(cw / iw, ch / ih) * Math.max(1, Number(scale) || 1);
  const width = iw * cover;
  const height = ih * cover;
  const x = (cw - width) / 2 + Math.max(-1, Math.min(1, panX)) * Math.abs(width - cw) / 2;
  const y = (ch - height) / 2 + Math.max(-1, Math.min(1, panY)) * Math.abs(height - ch) / 2;
  return { x, y, width, height };
}

/** Scale the editor's 1280x720 mask values to any export resolution. */
export function asmrMaskRect(
  maskX: number,
  maskY: number,
  maskW: number,
  maskH: number,
  canvasWidth: number,
  canvasHeight: number,
): CoverRect {
  const sx = Math.max(1, Number(canvasWidth) || 1) / 1280;
  const sy = Math.max(1, Number(canvasHeight) || 1) / 720;
  return {
    x: Math.max(0, Math.min(1, Number(maskX) || 0)) * canvasWidth,
    y: Math.max(0, Math.min(1, Number(maskY) || 0)) * canvasHeight,
    width: Math.max(1, Number(maskW) || 1) * sx,
    height: Math.max(1, Number(maskH) || 1) * sy,
  };
}
