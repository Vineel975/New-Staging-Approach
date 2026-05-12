import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

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

// GET /api/staging/pdf-urls?jobId=xxx
// Returns presigned URLs for hospital bill and tariff PDFs
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key") ?? "";
  if (STAGING_API_KEY && apiKey !== STAGING_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400, headers: corsHeaders() });
  }

  const convex = new ConvexHttpClient(CONVEX_URL);

  // Get job files — getJobById takes { jobId } not { id }
  const job = await convex.query(api.processing.getJobById, { jobId: jobId as Id<"processJob"> });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404, headers: corsHeaders() });
  }

  const billFile   = job.files?.find((f) => f.fileType === "hospitalBill");
  const tariffFile = job.files?.find((f) => f.fileType === "tariff");

  const billStorageId   = billFile?.storageId as Id<"_storage"> | undefined;
  const tariffStorageId = tariffFile?.storageId as Id<"_storage"> | undefined;

  const billUrl   = billStorageId
    ? await convex.query(api.processing.getPdfUrl, { storageId: billStorageId })
    : null;

  const tariffUrl = tariffStorageId
    ? await convex.query(api.processing.getPdfUrl, { storageId: tariffStorageId })
    : null;

  return NextResponse.json({
    billUrl,
    tariffUrl,
    billFileName:   billFile?.fileName   ?? null,
    tariffFileName: tariffFile?.fileName ?? null,
  }, { headers: corsHeaders() });
}
