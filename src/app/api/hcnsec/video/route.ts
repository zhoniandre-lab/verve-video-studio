"use server";
import { NextResponse } from "next/server";
import { generateVideo, pollVideo } from "@/lib/hcnsec";

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl, duration, model, aspectRatio, poll, negativePrompt, enhance,
      taskId, endpoint, pollOnly } = await req.json();

    // 🎬 v11.7: LANJUTKAN polling task yang SUDAH dibuat (tanpa bikin task baru = hemat kredit).
    // Dipakai tombol 🎥 Hidupkan di Lahan: POST pertama bisa pulang 202 kalau klip belum jadi.
    if (pollOnly && taskId) {
      const pollEp: string = endpoint || "/videos/generations";
      let res: any = { id: taskId, endpoint: pollEp, status: "pending", video_url: "" };
      let waited = 0; const interval = 3000; const maxWait = 26000;
      while (waited < maxWait) {
        await new Promise((r) => setTimeout(r, interval));
        waited += interval;
        const p = await pollVideo(String(taskId), pollEp);
        res = { ...res, ...p };
        if (res.video_url || res.status === "ready" || res.status === "succeeded") break;
        if (res.status === "error" || res.status === "failed") break;
      }
      if (!res.video_url && res.status !== "ready" && res.status !== "succeeded") {
        return NextResponse.json({ ...res, error: "Klip masih dimasak server — pantau terus ya bro." }, { status: 202 });
      }
      return NextResponse.json(res);
    }

    if (!prompt || !String(prompt).trim()) {
      return NextResponse.json({ error: "Prompt tidak boleh kosong", video_url: "", status: "error" }, { status: 400 });
    }
    // Batasi durasi agar tidak terlalu berat (khususnya di HP)
    const safeDur = Math.min(Math.max(Number(duration) || 5, 2), 8);

    let res = await generateVideo(prompt, {
      imageUrl,
      duration: safeDur,
      model,
      aspectRatio,
      negativePrompt,
    });

    // Auto-poll sampai siap (maks 60s untuk UX cepat)
    const shouldPoll = poll !== false;
    if (shouldPoll && res.id && res.status !== "ready" && res.status !== "succeeded" && res.video_url === "") {
      const pollEp: string = res.endpoint || "/videos/generations";
      const taskId: string = res.id;
      let waited = 0;
      const interval = 3000;
      const maxWait = 45000;
      while (waited < maxWait) {
        await new Promise((r) => setTimeout(r, interval));
        waited += interval;
        const p = await pollVideo(taskId, pollEp);
        res = { ...res, ...p };
        if (res.status === "ready" || res.status === "succeeded" || res.video_url) break;
        if (p.status === "error" || p.status === "failed") break;
      }
    }
    // Tambahkan flag jika gagal
    if (!res.video_url && res.status !== "ready") {
      return NextResponse.json(
        {
          ...res,
          error:
            "Video belum siap / model video tidak tersedia. TIPS: coba durasi 5s, rasio 16:9, prompt lebih sederhana, atau gunakan mode Slideshow yang lebih stabil.",
        },
        { status: 202 }
      );
    }
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Gagal generate video", video_url: "", status: "error" },
      { status: e.status || 500 }
    );
  }
}
