/* =====================================================================
   AUDIO ROOM — tipe & model zona (v19.37) — 100% orisinal
   ===================================================================== */

export type BentukZona = "circle" | "oval" | "polygon";
export type ResponZona = "bass" | "beat" | "treble" | "rms";
export type EfekZona = "pulse" | "basspush" | "getar" | "deform" | "glow" | "shadow";

export interface AudioZone {
  id: string;
  name: string;
  shape: BentukZona;
  /** posisi pusat RELATIF gambar (0..1) */
  x: number; y: number;
  /** jari-jari relatif: rx thd lebar, ry thd tinggi */
  rx: number; ry: number;
  /** polygon (relatif 0..1) — dipakai kalau shape = polygon */
  points?: { x: number; y: number }[];
  rotation: number;
  respon: ResponZona;
  kekuatan: number;   // 0..2 (gain)
  kecepatan: number;  // 0.5..2 (pengali smoothing)
  smooth: number;     // 0..1 (attack/release)
  deform: number;     // 0..1 (kedalaman cone)
  glow: number;       // 0..2
  blurEdge: number;   // 0..1 (softness tepi)
  snapBeat: boolean;
  efek: EfekZona[];
  visible: boolean;
}

export interface AudioRoomProject {
  bgImage: string;        // dataURL
  bgDim: number;          // 0..1
  zones: AudioZone[];
  audioUrl: string;
  audioName: string;
  shortStart: number;     // detik mulai render (klimaks)
  shortDur: number;
  createdAt: number;
}

export const AUDIO_ROOM_KEY = "verve_audioroom_v1";

export function newZone(shape: BentukZona, x: number, y: number): AudioZone {
  return {
    id: "z" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: shape === "circle" ? "Zona" : shape === "oval" ? "Oval" : "Polygon",
    shape, x, y, rx: 0.08, ry: 0.08, rotation: 0,
    respon: "bass", kekuatan: 1, kecepatan: 1, smooth: 0.5,
    deform: 0.6, glow: 0.8, blurEdge: 0.3, snapBeat: false,
    efek: ["pulse", "deform", "glow"], visible: true,
  };
}

export function simpanProyek(p: AudioRoomProject) {
  try { localStorage.setItem(AUDIO_ROOM_KEY, JSON.stringify(p)); } catch { /* penuh */ }
}
export function muatProyek(): AudioRoomProject | null {
  try {
    const j = JSON.parse(localStorage.getItem(AUDIO_ROOM_KEY) || "null");
    return j && j.zones ? j : null;
  } catch { return null; }
}
