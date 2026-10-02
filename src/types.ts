import type { z } from 'zod';
import {
  JobSchema,
  JobSkillSchema,
  SkillSchema,
  RoleFamilySchema,
  SnapshotMetadataSchema,
  ValidationIssueSchema,
  SnapshotAggregateSchema,
  TrendObservationSchema,
  CatalogSchema,
  SnapshotBundleSchema,
  LongitudinalBundleSchema,
} from './schemas.mjs';
export type Job = z.infer<typeof JobSchema>;
export type JobSkill = z.infer<typeof JobSkillSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type RoleFamily = z.infer<typeof RoleFamilySchema>;
export type SnapshotMetadata = z.infer<typeof SnapshotMetadataSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type SnapshotAggregate = z.infer<typeof SnapshotAggregateSchema>;
export type TrendObservation = z.infer<typeof TrendObservationSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;
export type SnapshotBundle = z.infer<typeof SnapshotBundleSchema>;
export type LongitudinalBundle = z.infer<typeof LongitudinalBundleSchema>;
export type Navigation = { page?: string; filters?: Record<string, string> };
export type SelectSnapshot = (id: string, navigation?: Navigation) => void;
