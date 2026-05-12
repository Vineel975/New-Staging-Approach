import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Upsert a staging job — insert if not exists, update if exists
export const upsertStagingJob = mutation({
  args: {
    claimId:            v.string(),
    slNo:               v.string(),
    status:             v.string(),
    jobId:              v.optional(v.string()),
    error:              v.optional(v.string()),
    preBenefitLimit:    v.optional(v.string()),
    preBenefitRuleName: v.optional(v.string()),
    preBenefitWarning:  v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("stagingJobs")
      .withIndex("by_claim", q => q.eq("claimId", args.claimId).eq("slNo", args.slNo))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status:             args.status,
        jobId:              args.jobId,
        error:              args.error,
        processedAt:        args.status === "done" ? Date.now() : existing.processedAt,
        preBenefitLimit:    args.preBenefitLimit,
        preBenefitRuleName: args.preBenefitRuleName,
        preBenefitWarning:  args.preBenefitWarning,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("stagingJobs", {
        claimId:            args.claimId,
        slNo:               args.slNo,
        status:             args.status,
        jobId:              args.jobId,
        error:              args.error,
        createdAt:          Date.now(),
        processedAt:        args.status === "done" ? Date.now() : undefined,
        preBenefitLimit:    args.preBenefitLimit,
        preBenefitRuleName: args.preBenefitRuleName,
        preBenefitWarning:  args.preBenefitWarning,
      });
    }
  },
});

// Get staging job by claimId + slNo
export const getStagingJob = query({
  args: {
    claimId: v.string(),
    slNo:    v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stagingJobs")
      .withIndex("by_claim", q => q.eq("claimId", args.claimId).eq("slNo", args.slNo))
      .first();
  },
});

// Get latest staging job for a claimId (any slNo)
export const getLatestStagingJob = query({
  args: { claimId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stagingJobs")
      .withIndex("by_claimId", q => q.eq("claimId", args.claimId))
      .order("desc")
      .first();
  },
});
