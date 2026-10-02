import { z } from 'zod';
export const SnapshotId = z.string().regex(/^\d{4}-Q[1-4]$/);
const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Invalid calendar date',
  );
export const SnapshotMetadataSchema = z.object({
  snapshot_id: SnapshotId,
  label: z.string().min(1),
  retrieval_date: DateString,
  status: z.enum(['draft', 'published', 'withdrawn']),
  methodology_version: z.string().min(1),
  taxonomy_version: z.string().min(1),
  notes: z.string().default(''),
  expected_records: z.number().int().positive().optional(),
  expected_regions: z.record(z.string(), z.number().int().nonnegative()).optional(),
  source_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  reported_statistics: z
    .array(
      z.object({
        category: z.string(),
        label: z.string(),
        stated: z.number().nonnegative(),
        reason: z.string().optional(),
      }),
    )
    .default([]),
});
export const SkillSchema = z.object({
  skill_code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  skill_name: z.string().min(1),
  skill_group: z.string().min(1),
  description: z.string(),
  origin: z.string(),
  introduced_in: SnapshotId,
  deprecated_in: SnapshotId.nullable(),
  aliases: z.array(z.string()),
  taxonomy_version: z.string(),
  text_pattern: z.string().nullable(),
  text_pattern_flags: z.string(),
  core_text_extension: z.boolean(),
  undefined_concept: z.boolean(),
});
export const RoleFamilySchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()),
  introduced_in: SnapshotId,
  deprecated_in: SnapshotId.nullable(),
  taxonomy_version: z.string(),
});
export const JobSchema = z.object({
  snapshot_id: SnapshotId,
  snapshot_label: z.string(),
  snapshot_job_id: z.string().min(1),
  job_id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  exact_title: z.string().min(1),
  role_family_raw: z.string(),
  normalized_role_family: z.string().min(1),
  company: z.string().min(1),
  country: z.string().min(1),
  region: z.string().min(1),
  location: z.string().min(1),
  seniority_raw: z.string().min(1),
  seniority_group: z.string().min(1),
  experience: z.string(),
  posting_date_or_status: z.string().min(1),
  retrieval_date: DateString,
  core_evidence: z.string().min(1),
  preferred_only: z.string(),
  normalized_skills_raw: z.string(),
  normalized_skills: z.array(z.string().min(1)).min(1),
  source_reference: z.string().min(1),
  source_reference_raw: z.string(),
  source_url: z.url().nullable(),
  source_line: z.number().int().positive(),
  source_row: z.string(),
  sector: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  employment_type: z.string().nullable().optional(),
  remote_status: z.string().nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  salary_currency: z.string().nullable().optional(),
  education_requirement: z.string().nullable().optional(),
  years_experience_min: z.number().nullable().optional(),
  years_experience_max: z.number().nullable().optional(),
  requisition_id: z.string().nullable().optional(),
  first_seen: z.string().nullable().optional(),
  last_seen: z.string().nullable().optional(),
  posting_identity: z.string().optional(),
  previously_seen: z.boolean().optional(),
  first_seen_snapshot: SnapshotId.optional(),
  last_seen_snapshot: SnapshotId.optional(),
});
export const JobSkillSchema = z.object({
  snapshot_id: SnapshotId,
  snapshot_label: z.string(),
  retrieval_date: DateString,
  snapshot_job_id: z.string(),
  job_id: z.string(),
  skill_code: z.string(),
  skill_name: z.string(),
  skill_group: z.string(),
  requirement_type: z.enum(['core', 'preferred', 'unspecified']),
  evidence_text: z.string().min(1),
  evidence_basis: z.string(),
  region: z.string(),
  role_family: z.string(),
  seniority_group: z.string(),
  source_reference: z.string().min(1),
  source_line: z.number().int().positive(),
});
export const ValidationIssueSchema = z.object({
  severity: z.enum(['ERROR', 'WARNING', 'INFO']),
  code: z.string(),
  message: z.string(),
  job_id: z.string().optional(),
  skill_code: z.string().optional(),
});
export const TrendObservationSchema = z
  .object({
    snapshot_id: SnapshotId,
    count: z.number().int().nonnegative(),
    denominator: z.number().int().nonnegative(),
    percentage: z.number().min(0).max(100),
    job_ids: z.array(z.string()),
  })
  .passthrough();
export const SnapshotAggregateSchema = z.record(z.string(), z.array(TrendObservationSchema));
export const DistributionSchema = z.object({
  label: z.string(),
  count: z.number(),
  denominator: z.number(),
  percentage: z.number(),
  job_ids: z.array(z.string()),
});
const ClaimSchema = z.object({
  category: z.string(),
  label: z.string(),
  stated: z.number(),
  calculated: z.number().nullable(),
  difference: z.number().nullable(),
  reason: z.string(),
});
export const ValidationReportSchema = z.object({
  snapshot_id: SnapshotId,
  source_sha256: z.string(),
  records: z.number(),
  duplicates: z.array(z.string()),
  invalid_references: z.array(JobSkillSchema),
  missing_fields: z.record(z.string(), z.number()),
  source_references_available: z.number(),
  source_urls_available: z.number(),
  ambiguous_seniority: z.array(z.string()),
  undefined_codes: z.array(z.string()),
  core_preferred_status: z.array(DistributionSchema),
  comparisons: z.array(ClaimSchema),
  discrepancies: z.array(ClaimSchema),
  distributions: z.record(z.string(), z.array(DistributionSchema)),
  structural_pass: z.boolean(),
  issues: z.array(ValidationIssueSchema),
  errors: z.number(),
  warnings: z.number(),
  notes: z.array(z.string()),
});
export const SnapshotEntrySchema = SnapshotMetadataSchema.extend({
  records: z.number(),
  errors: z.number(),
  warnings: z.number(),
  report_path: z.string(),
  bundle_path: z.string(),
  validation_path: z.string(),
  downloads: z.array(z.string()),
});
const ShareSchema = z.object({ count: z.number(), denominator: z.number(), percentage: z.number() });
export const ComparabilitySchema = z.object({
  interpretation: z.string(),
  comparisons: z.array(
    z.object({
      from_snapshot: SnapshotId,
      to_snapshot: SnapshotId,
      comparable_versions: z.boolean(),
      warnings: z.array(z.string()),
      changes: z.array(
        z.object({
          dimension: z.string(),
          label: z.string(),
          before: ShareSchema,
          after: ShareSchema,
          percentage_point_change: z.number(),
        }),
      ),
    }),
  ),
});
export const CatalogSchema = z.object({
  schema_version: z.string(),
  latest_snapshot_id: SnapshotId,
  taxonomy_version: z.string(),
  snapshots: z.array(SnapshotEntrySchema).min(1),
  downloads: z.array(z.string()),
  skills: z.array(SkillSchema),
  role_families: z.array(RoleFamilySchema),
  comparability: ComparabilitySchema,
});
export const SnapshotBundleSchema = z.object({
  metadata: SnapshotEntrySchema,
  jobs: z.array(JobSchema),
  jobSkills: z.array(JobSkillSchema),
  skills: z.array(SkillSchema),
  validation: ValidationReportSchema,
  report: z.string().optional(),
});
export const LongitudinalBundleSchema = z.object({
  jobs: z.array(JobSchema),
  jobSkills: z.array(
    JobSkillSchema.pick({
      job_id: true,
      snapshot_job_id: true,
      snapshot_id: true,
      skill_code: true,
      skill_group: true,
      requirement_type: true,
    }),
  ),
});
