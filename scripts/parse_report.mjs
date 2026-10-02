import { createHash } from 'node:crypto';

export const groups = {
  Programming: ['PY', 'R'],
  'Software Engineering': ['SWE'],
  'Data & SQL': ['SQL', 'DM', 'WH'],
  'Statistics & Experimentation': ['STAT', 'EXP', 'CAUS'],
  'Data Engineering': ['DE'],
  'Traditional ML': ['ML'],
  'Deep Learning': ['DL', 'NLP', 'CV'],
  'GenAI & LLM': ['GEN', 'FT', 'PROMPT'],
  'Retrieval & RAG': ['RAG', 'EMB', 'VEC'],
  'Agentic AI': ['AGT', 'TOOL', 'MCP', 'MAG'],
  'APIs & Integration': ['API', 'INT'],
  Cloud: ['CLOUD', 'AWS', 'AZ', 'GCP'],
  'Data Platforms': ['DBX', 'SNOW'],
  'MLOps / LLMOps': ['MLOPS', 'LLOPS', 'SERV'],
  'Deployment & Infrastructure': ['DIST', 'DKR', 'K8S', 'CICD', 'IAC'],
  'Testing / Evaluation / Observability': ['EVAL', 'TEST', 'OBS', 'GRD'],
  'Security / Governance': ['SEC', 'GOV'],
  'Business / Communication': ['COMM', 'BI'],
  'Specialised ML': ['REC', 'OPT', 'TS'],
  'Framework / Tool': [
    'LANGCHAIN',
    'LANGGRAPH',
    'LLAMAINDEX',
    'SEMANTIC',
    'PYTORCH',
    'TENSORFLOW',
    'DBT',
    'SPARK',
  ],
  'Undefined in report': ['DOM'],
};
// Explicit lexical mappings only. The report's assigned codes remain a separate evidence basis.
export const patterns = {
  PY: /\bPython\b/i,
  SQL: /\bSQL\b/i,
  SWE: /\bSWE\b|software engineering|full.stack/i,
  DE: /\bETL\b|\bELT\b|data engineering|data pipelines/i,
  DM: /data modell?ing/i,
  WH: /warehous|lakehouse|\bDW\b/i,
  STAT: /statistic/i,
  ML: /\bML\b|machine learning/i,
  DL: /\bDL\b|deep learning/i,
  NLP: /\bNLP\b/i,
  CV: /\bCV\b|computer vision|3D vision/i,
  GEN: /\bGenAI\b|\bLLMs?\b|foundation.models?/i,
  RAG: /\bRAG\b|retrieval.augmented/i,
  EMB: /embedding/i,
  VEC: /vector (?:search|DB|database)/i,
  AGT: /\bagents?\b|agentic/i,
  TOOL: /tool (?:use|calling)|function calling/i,
  MCP: /\bMCP\b/i,
  MAG: /multi.agent/i,
  EVAL: /\bevals?\b|evaluation/i,
  GRD: /guardrail/i,
  API: /\bAPIs?\b|backend/i,
  INT: /systems integration/i,
  DIST: /distributed/i,
  AWS: /\bAWS\b/i,
  AZ: /\bAzure\b/i,
  GCP: /\bGCP\b/i,
  DBX: /Databricks/i,
  SNOW: /Snowflake/i,
  DKR: /Docker/i,
  K8S: /K8s|Kubernetes/i,
  CICD: /CI\/CD/i,
  IAC: /\bIaC\b|Terraform|infrastructure as code/i,
  MLOPS: /\bMLOps\b/i,
  LLOPS: /LLMOps|AI Ops/i,
  SERV: /model serving/i,
  OBS: /monitoring|observability/i,
  TEST: /\btests?\b|testing/i,
  SEC: /security|privacy/i,
  GOV: /governance|responsible AI/i,
  COMM: /stakeholder|communication/i,
  EXP: /experiment/i,
  CAUS: /causal/i,
  REC: /ranking|recommendation/i,
  OPT: /optimis|optimiz/i,
  TS: /time.series|\bTS\b/i,
  BI: /\bBI\b|visualisation|visualization/i,
  R: /\bPython\/R\b|\bR\b/,
  CLOUD: /cloud/i,
  FT: /fine.tun/i,
  PROMPT: /prompt/i,
  LANGCHAIN: /LangChain/i,
  LANGGRAPH: /LangGraph/i,
  LLAMAINDEX: /LlamaIndex/i,
  SEMANTIC: /Semantic Kernel/i,
  PYTORCH: /PyTorch/i,
  TENSORFLOW: /TensorFlow/i,
  DBT: /\bdbt\b/i,
  SPARK: /\b(?:Py)?Spark\b/i,
};
export const familyMap = {
  'ML Engineering': 'Machine Learning Engineering',
  'GenAI/LLM': 'GenAI / LLM',
  'MLOps/ML Platform': 'MLOps / ML Platform',
  'AI Platform/Infrastructure': 'AI Platform / Infrastructure',
};
export function seniority(raw) {
  const map = {
    Mid: 'Mid',
    Senior: 'Senior',
    Junior: 'Entry / Junior',
    'Entry/Graduate': 'Entry / Junior',
    Staff: 'Staff / Lead / Principal',
    Lead: 'Staff / Lead / Principal',
    Principal: 'Staff / Lead / Principal',
    'Staff/Principal': 'Staff / Lead / Principal',
    'Lead/VP': 'Staff / Lead / Principal',
    'Senior/VP': 'Senior',
  };
  return map[raw] || `Ambiguous: ${raw}`;
}
export function parseReport(report) {
  const lines = report.split(/\r?\n/);
  const taxonomyLine = lines.find((l) => l.startsWith('Normalised-skill codes used below'));
  if (!taxonomyLine) throw Error('Taxonomy paragraph not found');
  const skills = [...taxonomyLine.matchAll(/\*\*([^*]+)\*\* ([^;]+)(?:;|$)/g)].flatMap(([, codes, name]) => {
    const expansion = {
      'AWS/AZ/GCP': ['AWS', 'Azure', 'GCP'],
      'DKR/K8S': ['Docker', 'Kubernetes'],
      'MLOPS/LLOPS': ['MLOps', 'LLMOps / AI Ops'],
    };
    return codes
      .split('/')
      .map((skill_code, i) => ({
        skill_code,
        skill_name: expansion[codes]?.[i] || name.replace(/\.$/, ''),
        origin: 'report taxonomy',
      }));
  });
  const extras = {
    R: 'R',
    DOM: 'DOM — undefined source code',
    CLOUD: 'Generic cloud (explicit text)',
    FT: 'Fine-tuning',
    PROMPT: 'Prompt engineering',
    LANGCHAIN: 'LangChain',
    LANGGRAPH: 'LangGraph',
    LLAMAINDEX: 'LlamaIndex',
    SEMANTIC: 'Semantic Kernel',
    PYTORCH: 'PyTorch',
    TENSORFLOW: 'TensorFlow',
    DBT: 'dbt',
    SPARK: 'Spark / PySpark',
  };
  for (const [skill_code, skill_name] of Object.entries(extras))
    skills.push({
      skill_code,
      skill_name,
      origin:
        skill_code === 'DOM'
          ? 'undefined appendix code'
          : skill_code === 'R'
            ? 'appendix code; explicit R text'
            : 'explicit-text extension',
    });
  skills.forEach((s) => {
    s.skill_group =
      Object.entries(groups).find(([, codes]) => codes.includes(s.skill_code))?.[0] || 'Undefined in report';
    s.description =
      s.origin === 'report taxonomy'
        ? `Meaning preserved from report: ${s.skill_name}.`
        : s.skill_code === 'DOM'
          ? 'The appendix uses DOM but never defines it. No expansion inferred.'
          : `Explicit text only; ${s.origin}.`;
  });
  const jobs = [];
  for (const [i, line] of lines.entries()) {
    if (!/^\| [FEU]\d{2} \|/.test(line)) continue;
    const c = line
      .split('|')
      .slice(1, -1)
      .map((s) => s.trim());
    if (c.length !== 14) throw Error(`Expected 14 columns at line ${i + 1}, got ${c.length}`);
    const [
      job_id,
      exact_title,
      role_family_raw,
      company,
      country,
      region,
      location,
      seniority_raw,
      experience,
      posting_date_or_status,
      core_evidence,
      preferred_only,
      normalized_skills_raw,
      source_reference_raw,
    ] = c;
    jobs.push({
      job_id,
      exact_title,
      role_family_raw,
      normalized_role_family: familyMap[role_family_raw] || role_family_raw,
      company,
      country,
      region,
      location,
      seniority_raw,
      seniority_group: seniority(seniority_raw),
      experience,
      posting_date_or_status,
      retrieval_date: '2026-10-02',
      core_evidence,
      preferred_only,
      normalized_skills_raw,
      normalized_skills: normalized_skills_raw.split(',').map((s) => s.trim()),
      source_reference: [...source_reference_raw.matchAll(/turn\w+/g)].map((m) => m[0]).join('; '),
      source_reference_raw,
      source_url: null,
      source_line: i + 1,
      source_row: line,
    });
  }
  const jobSkills = [];
  for (const j of jobs) {
    const candidates = new Set([
      ...j.normalized_skills,
      ...Object.keys(patterns).filter((k) => patterns[k].test(j.preferred_only)),
      ...Object.keys(extras).filter((k) => patterns[k]?.test(j.core_evidence)),
    ]);
    for (const code of candidates) {
      const s = skills.find((s) => s.skill_code === code);
      if (!s) throw Error(`Unknown code ${code} in ${j.job_id}`);
      const coded = j.normalized_skills.includes(code),
        coreText = patterns[code]?.test(j.core_evidence),
        preferred = patterns[code]?.test(j.preferred_only);
      // Normalised appendix codes are the report's core coding; preferred-only explicit matches take precedence.
      const types =
        code === 'DOM'
          ? ['unspecified']
          : coded && preferred && !coreText
            ? ['preferred']
            : coded || coreText
              ? preferred
                ? ['core', 'preferred']
                : ['core']
              : ['preferred'];
      for (const requirement_type of types)
        jobSkills.push({
          job_id: j.job_id,
          skill_code: code,
          skill_name: s.skill_name,
          skill_group: s.skill_group,
          requirement_type,
          evidence_text:
            requirement_type === 'preferred'
              ? j.preferred_only
              : coded
                ? `Normalised skills: ${j.normalized_skills_raw}\nCore evidence: ${j.core_evidence}`
                : j.core_evidence,
          evidence_basis:
            code === 'DOM'
              ? 'Undefined code; classification unavailable'
              : requirement_type === 'preferred'
                ? 'Explicit preferred-only text'
                : coded
                  ? 'Report-assigned normalized code'
                  : 'Explicit core text extension',
          region: j.region,
          role_family: j.normalized_role_family,
          seniority_group: j.seniority_group,
          source_reference: j.source_reference,
          source_line: j.source_line,
        });
    }
  }
  return { jobs, skills, jobSkills, sourceHash: createHash('sha256').update(report).digest('hex') };
}
