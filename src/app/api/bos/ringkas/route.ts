import { NextRequest, NextResponse } from "next/server";
import { mintaBos } from "../../../../lib/bos";
import { tarikBarisKredit, agregatRingkas } from "../../../../lib/ledger";
import { getSetelanPaksa, mulaiHariIniWIB } from "../../../../lib/setelan";

/** 👑 /api/bos/ringkas — data dasbor bos (kredit + setelan). Pintu: login email bos. */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const bos = await mintaBos();
  if (!bos.ok) {
    return NextResponse.json(
      { bos: false, alasan: bos.alasan || "ditolak" },
      { status: bos.alasan === "belum login" ? 401 : 403 }
    );
  }
  const hari = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get("hari") || "14", 10) || 14, 1), 90);
  const hasil = await tarikBarisKredit(hari);
  if (!hasil.siap) {
    return NextResponse.json({ error: `Ledger belum siap: ${hasil.alasan}` }, { status: 503 });
  }
  const setelan = await getSetelanPaksa();
  return NextResponse.json(
    { bos: true, email: bos.email, hari, mulaiHariIniWIB: mulaiHariIniWIB(), setelan, ...agregatRingkas(hasil.baris || []) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
