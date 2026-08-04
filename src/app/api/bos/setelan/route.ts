import { NextRequest, NextResponse } from "next/server";
import { mintaBos } from "../../../../lib/bos";
import { getSetelanPaksa, setSetelan } from "../../../../lib/setelan";

/** 👑 /api/bos/setelan — baca (GET) & tulis (POST) tombol kendali bos. Pintu: login email bos. */
export const dynamic = "force-dynamic";

async function jaga() {
  const bos = await mintaBos();
  if (!bos.ok) {
    return { tolak: NextResponse.json(
      { bos: false, alasan: bos.alasan || "ditolak" },
      { status: bos.alasan === "belum login" ? 401 : 403 }
    ) };
  }
  return { tolak: null as NextResponse | null, email: bos.email };
}

export async function GET() {
  const { tolak } = await jaga();
  if (tolak) return tolak;
  return NextResponse.json({ ok: true, setelan: await getSetelanPaksa() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const { tolak, email } = await jaga();
  if (tolak) return tolak;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "body bukan JSON" }, { status: 400 }); }
  const hasil = await setSetelan(body);
  if (!hasil.ok) return NextResponse.json({ error: hasil.alasan }, { status: 500 });
  const segar = await getSetelanPaksa();
  console.log(`[bos] setelan diubah oleh ${email}: mati=${segar.mati.join(",") || "-"} batas=${JSON.stringify(segar.batas)} pengumuman=${segar.pengumuman ? "ada" : "kosong"}`);
  return NextResponse.json({ ok: true, setelan: segar }, { headers: { "Cache-Control": "no-store" } });
}
