import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const CONVEX_URL      = (process.env.CONVEX_URL_PUBLIC ?? process.env.NEXT_PUBLIC_CONVEX_URL)!;
const STAGING_API_KEY = process.env.STAGING_API_KEY ?? "";

// GET /api/staging/summary?claimId=X&slNo=Y
// Called by Spectra when doctor opens a claim — returns status + jobId if ready
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key") ?? "";
  if (STAGING_API_KEY && apiKey !== STAGING_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const claimId = searchParams.get("claimId")?.trim();
  const slNo    = searchParams.get("slNo")?.trim() ?? "1";

  if (!claimId) {
    return NextResponse.json({ error: "claimId required" }, { status: 400 });
  }

  const convex = new ConvexHttpClient(CONVEX_URL);

  // Try exact match first (claimId + slNo)
  let job = await convex.query(api.stagingMutations.getStagingJob, { claimId, slNo });

  // Fall back to latest job for this claimId
  if (!job) {
    job = await convex.query(api.stagingMutations.getLatestStagingJob, { claimId });
  }

  if (!job) {
    return NextResponse.json({ status: "not_found" });
  }

  if (job.status === "done" && job.jobId) {
    return NextResponse.json({ status: "done", jobId: job.jobId });
  }

  if (job.status === "processing" || job.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }

  if (job.status === "failed") {
    return NextResponse.json({ status: "failed", error: job.error });
  }

  return NextResponse.json({ status: "not_found" });
}
