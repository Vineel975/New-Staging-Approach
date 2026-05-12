import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const CONVEX_URL      = (process.env.CONVEX_URL_PUBLIC ?? process.env.NEXT_PUBLIC_CONVEX_URL)!;
const STAGING_API_KEY = process.env.STAGING_API_KEY ?? "";
const SPECTRA_BASE_URL = process.env.SPECTRA_BASE_URL ?? "";

// CORS headers — allow Spectra origin
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key") ?? "";
  if (STAGING_API_KEY && apiKey !== STAGING_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const body    = (await request.json()) as { claimId?: string; slNo?: string };
  const claimId = body?.claimId?.trim();
  const slNo    = body?.slNo?.trim() ?? "1";

  if (!claimId) {
    return NextResponse.json({ error: "claimId required" }, { status: 400, headers: corsHeaders() });
  }

  const convex = new ConvexHttpClient(CONVEX_URL);

  const existing = await convex.query(api.stagingMutations.getStagingJob, { claimId, slNo });
  if (existing?.status === "done" && existing.jobId) {
    return NextResponse.json({ status: "already_done", jobId: existing.jobId }, { headers: corsHeaders() });
  }
  if (existing?.status === "processing") {
    return NextResponse.json({ status: "already_processing" }, { headers: corsHeaders() });
  }

  await convex.mutation(api.stagingMutations.upsertStagingJob, { claimId, slNo, status: "processing" });

  void processInBackground(claimId, slNo, convex);

  return NextResponse.json({ status: "accepted" }, { status: 202, headers: corsHeaders() });
}

async function processInBackground(claimId: string, slNo: string, convex: ConvexHttpClient) {
  try {
    console.log(`[Staging] Background processing for claim ${claimId}`);

    if (!SPECTRA_BASE_URL) throw new Error("SPECTRA_BASE_URL not configured");

    const docsRes  = await fetch(
      `${SPECTRA_BASE_URL}/MedicalScrutiny/GetDocumentsForStaging?claimId=${claimId}&slNo=${slNo}`,
      { headers: { "x-staging-key": STAGING_API_KEY }, signal: AbortSignal.timeout(60000) }
    );
    if (!docsRes.ok) throw new Error(`GetDocumentsForStaging failed: ${docsRes.status}`);

    const docsData = (await docsRes.json()) as {
      Success: boolean; Message?: string;
      BillBase64?: string; BillFileName?: string;
      TariffBase64?: string; TariffFileName?: string;
    };
    if (!docsData.Success || !docsData.BillBase64)
      throw new Error(`Documents fetch failed: ${docsData.Message ?? "no bill"}`);

    const billBuffer = Buffer.from(docsData.BillBase64, "base64");
    const billFile   = new File([billBuffer], docsData.BillFileName ?? "bill.pdf", { type: "application/pdf" });

    let tariffFile: File | null = null;
    if (docsData.TariffBase64) {
      const buf  = Buffer.from(docsData.TariffBase64, "base64");
      tariffFile = new File([buf], docsData.TariffFileName ?? "tariff.pdf", { type: "application/pdf" });
    }

    const formData = new FormData();
    formData.append("claimId",     claimId);
    formData.append("medicalBill", billFile);
    if (tariffFile) formData.append("tariffBill", tariffFile);

    const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const auditRes = await fetch(`${baseUrl}/api/audit/start`, { method: "POST", body: formData });
    if (!auditRes.ok) throw new Error(`audit/start failed: ${auditRes.status}`);

    const auditData = (await auditRes.json()) as { success: boolean; jobId?: string; error?: string };
    if (!auditData.success || !auditData.jobId)
      throw new Error(`audit/start error: ${auditData.error ?? "no jobId"}`);

    console.log(`[Staging] Claim ${claimId} done, jobId=${auditData.jobId}`);
    await convex.mutation(api.stagingMutations.upsertStagingJob, {
      claimId, slNo, status: "done", jobId: auditData.jobId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Staging] Failed for claim ${claimId}:`, msg);
    await convex.mutation(api.stagingMutations.upsertStagingJob, {
      claimId, slNo, status: "failed", error: msg,
    });
  }
}
