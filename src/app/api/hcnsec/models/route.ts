"use server";
import { NextResponse } from "next/server";
import { listModels } from "@/lib/hcnsec";

export async function GET() {
  return NextResponse.json(listModels());
}
