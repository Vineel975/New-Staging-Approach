import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const CONVEX_URL      = (process.env.CONVEX_URL_PUBLIC ?? process.env.NEXT_PUBLIC_CONVEX_URL)!;
const STAGING_API_KEY = process.env.STAGING_API_KEY ?? "";

// POST /api/staging/store-job
// Called by Spectra after on-demand processing — stores jobId for future fast loads
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key") ?? "";
  if (STAGING_API_KEY && apiKey !== STAGING_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    claimId?: string;
    slNo?:    string;
    jobId?:   string;
  };

  const claimId = body?.claimId?.trim();
  const slNo    = body?.slNo?.trim() ?? "1";
  const jobId   = body?.jobId?.trim();

  if (!claimId || !jobId) {
    return NextResponse.json({ error: "claimId and jobId required" }, { status: 400 });
  }

  const convex = new ConvexHttpClient(CONVEX_URL);
  await convex.mutation(api.stagingMutations.upsertStagingJob, {
    claimId, slNo, status: "done", jobId,
  });

  console.log(`[Staging] Stored on-demand jobId=${jobId} for claim ${claimId}`);
  return NextResponse.json({ success: true });
}
