"use server";
import { NextResponse } from "next/server";
import { generateVideo, pollVideo } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl, duration, model, aspectRatio, poll } = await req.json();
    let res = await generateVideo(prompt, { imageUrl, duration, model, aspectRatio });
    const taskId: string | undefined = res.id;
    // kalau async (ada task id + status bukan ready), poll beberapa kali
    if (poll !== false && taskId && res.status !== "ready" && res.status !== "succeeded") {
      let currentId: string = taskId;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const p = await pollVideo(currentId, model);
        res = { ...res, ...p };
        if (res.status === "ready" || res.status === "succeeded" || res.video_url) break;
      }
    }
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, video_url: "", status: "error" }, { status: 500 });
  }
}
