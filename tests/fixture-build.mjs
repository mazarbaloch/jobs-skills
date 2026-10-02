import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runBuild } from '../scripts/pipeline.mjs';
export function buildFixture(name = 'quarterly') {
  if (!/^[a-z-]+$/.test(name)) throw Error('Unsafe fixture name');
  const root = resolve(`tests/fixtures/.generated/${name}`);
  mkdirSync(`${root}/research`, { recursive: true });
  mkdirSync(`${root}/data`, { recursive: true });
  cpSync('tests/fixtures/quarterly/research', `${root}/research`, { recursive: true });
  cpSync('data/taxonomy', `${root}/data/taxonomy`, { recursive: true });
  const skills = JSON.parse(readFileSync('data/taxonomy/skills.json', 'utf8'));
  skills.push(...JSON.parse(readFileSync('tests/fixtures/quarterly/taxonomy_additions.json', 'utf8')));
  writeFileSync(`${root}/data/taxonomy/skills.json`, JSON.stringify(skills, null, 2) + '\n');
  return { root, build: runBuild({ root }) };
}
