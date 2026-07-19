declare module "gifenc" {
  export interface GIFEncoderInstance {
    writeFrame(index: Uint8Array | number[], width: number, height: number, opts?: { palette?: number[][] | Uint32Array; delay?: number; transparent?: number; dispose?: number; first?: boolean }): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(): GIFEncoderInstance;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: string; oneBitAlpha?: boolean }): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}
