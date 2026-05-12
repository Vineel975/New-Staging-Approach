import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const CONVEX_URL      = (process.env.CONVEX_URL_PUBLIC ?? process.env.NEXT_PUBLIC_CONVEX_URL)!;
const STAGING_API_KEY = process.env.STAGING_API_KEY ?? "";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key") ?? "";
  if (STAGING_API_KEY && apiKey !== STAGING_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const { searchParams } = new URL(request.url);
  const claimId = searchParams.get("claimId")?.trim();
  const slNo    = searchParams.get("slNo")?.trim() ?? "1";

  if (!claimId) {
    return NextResponse.json({ error: "claimId required" }, { status: 400, headers: corsHeaders() });
  }

  const convex = new ConvexHttpClient(CONVEX_URL);

  let job = await convex.query(api.stagingMutations.getStagingJob, { claimId, slNo });
  if (!job) job = await convex.query(api.stagingMutations.getLatestStagingJob, { claimId });

  if (!job)                                   return NextResponse.json({ status: "not_found" },                          { headers: corsHeaders() });
  if (job.status === "done" && job.jobId)     return NextResponse.json({ status: "done", jobId: job.jobId, preBenefitLimit: job.preBenefitLimit, preBenefitRuleName: job.preBenefitRuleName, preBenefitWarning: job.preBenefitWarning }, { headers: corsHeaders() });
  if (job.status === "processing" || job.status === "pending") return NextResponse.json({ status: "pending" },           { headers: corsHeaders() });
  if (job.status === "failed")                return NextResponse.json({ status: "failed", error: job.error },          { headers: corsHeaders() });

  return NextResponse.json({ status: "not_found" }, { headers: corsHeaders() });
}
