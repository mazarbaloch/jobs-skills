export interface Observation {
  job_id: string;
  skill_code: string;
  skill_group: string;
  requirement_type: string;
  [key: string]: unknown;
}
export interface Skill {
  skill_code: string;
  skill_name: string;
  skill_group: string;
  [key: string]: unknown;
}
export interface Frequency extends Skill {
  count: number;
  denominator: number;
  percentage: number;
  job_ids: string[];
}
export interface Distribution {
  label: string;
  count: number;
  denominator: number;
  percentage: number;
  job_ids: string[];
}
export const regions: string[];
export function identity(row: { job_id: string; snapshot_job_id?: string }): string;
export function observations<T extends Observation>(rows: T[], type?: string): T[];
export function selectJobs<T extends { job_id: string }>(
  jobs: T[],
  rows: Observation[],
  filters?: Record<string, string>,
): T[];
export function frequency(
  jobs: { job_id: string }[],
  rows: Observation[],
  skills: Skill[],
  type?: string,
): Frequency[];
export function distribution<T>(jobs: T[], key: keyof T): Distribution[];
export const combinations: string[][];
export function combine(
  jobs: { job_id: string }[],
  rows: Observation[],
  type?: string,
): (Distribution & { skill_codes: string[] })[];
export function csv<T>(rows: T[]): string;
