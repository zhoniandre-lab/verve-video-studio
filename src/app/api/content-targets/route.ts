import { NextResponse } from "next/server";
import { getContentApiTarget, listApifyActors, listContentApiTargets } from "@/lib/brain/content-api-targets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("feature") || searchParams.get("key") || "";
  const target = key ? getContentApiTarget(key) : null;

  if (key && !target) {
    return NextResponse.json(
      {
        ok: false,
        error: "feature_not_found",
        message: "Feature API target tidak ditemukan.",
        available: listContentApiTargets().map((item) => item.key),
      },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      source: "API-mega-list curated targets for VERVE",
      apifyConfigured: !!process.env.APIFY_TOKEN,
      totalTargets: listContentApiTargets().length,
      totalApifyActors: listApifyActors().length,
      targets: target ? [target] : listContentApiTargets(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
