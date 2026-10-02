import { frequency, distribution, combine } from '../src/analysis.mjs';
export function aggregates({ jobs, jobSkills, skills }) {
  const by = (key) =>
    [...new Set(jobs.map((j) => j[key]))].flatMap((value) =>
      frequency(
        jobs.filter((j) => j[key] === value),
        jobSkills,
        skills,
      ).map((r) => ({ [key]: value, ...r })),
    );
  return {
    skill_frequency_overall: frequency(jobs, jobSkills, skills),
    skill_frequency_by_region: by('region'),
    skill_frequency_by_role: by('normalized_role_family'),
    skill_frequency_by_seniority: by('seniority_group'),
    role_frequency_by_region: [...new Set(jobs.map((j) => j.region))].flatMap((region) =>
      distribution(
        jobs.filter((j) => j.region === region),
        'normalized_role_family',
      ).map((r) => ({ region, ...r })),
    ),
    technology_frequency: frequency(
      jobs,
      jobSkills,
      skills.filter((s) =>
        [
          'Programming',
          'Cloud',
          'Data Platforms',
          'Deployment & Infrastructure',
          'Framework / Tool',
        ].includes(s.skill_group),
      ),
    ),
    skill_combinations: combine(jobs, jobSkills),
    emerging_titles: distribution(jobs, 'exact_title')
      .filter((r) => /agentic|AI|LLM|intelligence|forward deployed/i.test(r.label))
      .map((r) => ({
        ...r,
        selection_rule:
          'Explicit title contains AI, LLM, intelligence, agentic, or forward deployed; descriptive selection, not proof of novelty.',
      })),
  };
}
