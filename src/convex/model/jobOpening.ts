import { v, type Infer } from "convex/values";
import {
  JOB_EMPLOYMENT_TYPES,
  JOB_STATUSES,
  JOB_WORKPLACE_TYPES,
} from "../../lib/site/jobs";

export const jobWorkplaceTypeValidator = v.union(
  ...JOB_WORKPLACE_TYPES.map((value) => v.literal(value)),
);

export const jobEmploymentTypeValidator = v.union(
  ...JOB_EMPLOYMENT_TYPES.map((value) => v.literal(value)),
);

export const jobStatusValidator = v.union(
  ...JOB_STATUSES.map((value) => v.literal(value)),
);

/** Draft rows may be incomplete while the owner fills the form. */
export const jobOpeningDraftFieldsValidator = v.object({
  summary: v.optional(v.string()),
  description: v.optional(v.string()),
  requirements: v.optional(v.array(v.string())),
  location: v.optional(v.string()),
  country: v.optional(v.string()),
  workplaceType: v.optional(jobWorkplaceTypeValidator),
  employmentType: v.optional(jobEmploymentTypeValidator),
  hoursText: v.optional(v.string()),
  salaryText: v.optional(v.string()),
  deadlineAt: v.optional(v.number()),
  applyUrl: v.optional(v.string()),
  status: jobStatusValidator,
  publishedAt: v.optional(v.number()),
});

/** Owner-editable fields. `publishedAt` is stamped only by publish. */
export const jobOpeningOwnerInputValidator = v.object({
  summary: v.optional(v.string()),
  description: v.optional(v.string()),
  requirements: v.optional(v.array(v.string())),
  location: v.optional(v.string()),
  country: v.optional(v.string()),
  workplaceType: v.optional(jobWorkplaceTypeValidator),
  employmentType: v.optional(jobEmploymentTypeValidator),
  hoursText: v.optional(v.string()),
  salaryText: v.optional(v.string()),
  deadlineAt: v.optional(v.number()),
  applyUrl: v.optional(v.string()),
  status: jobStatusValidator,
});

/** Prose-only locale overlay. Routing, status, dates, URLs and enums stay primary-owned. */
export const localizedJobOpeningFieldsValidator = v.object({
  summary: v.optional(v.string()),
  description: v.optional(v.string()),
  requirements: v.optional(v.array(v.string())),
  location: v.optional(v.string()),
  hoursText: v.optional(v.string()),
  salaryText: v.optional(v.string()),
});

/** Reused by pages, published snapshots, mutations and portability. */
export const jobOpeningFieldsValidator = v.object({
  summary: v.string(),
  description: v.string(),
  requirements: v.array(v.string()),
  location: v.string(),
  country: v.string(),
  workplaceType: jobWorkplaceTypeValidator,
  employmentType: jobEmploymentTypeValidator,
  hoursText: v.optional(v.string()),
  salaryText: v.optional(v.string()),
  deadlineAt: v.optional(v.number()),
  applyUrl: v.string(),
  status: jobStatusValidator,
  publishedAt: v.optional(v.number()),
});

export type StoredJobOpeningFields = Infer<typeof jobOpeningFieldsValidator>;
