import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourceDirectory = path.join(projectRoot, 'src');
const dependencies = [
  'runtime-env.js',
  'runtime-config.js',
  'provider-config.js',
  'provider-client.js',
  'provider-settings.js',
  'direct-report-validator.js',
  'direct-ai-client.js',
  'auth-client.js',
  'material.js',
  'repository.js',
  'analysis-repository.js',
  'analysis-client.js',
  'settings-client.js',
  'report-client.js',
  'analysis-coordinator.js',
];

const sections = [];
for (const filename of dependencies) {
  const contents = await readFile(path.join(sourceDirectory, filename), 'utf8');
  sections.push(`// bundled dependency: ${filename}\n${contents.trim()}\n`);
}

const backgroundSource = await readFile(path.join(sourceDirectory, 'background.js'), 'utf8');
const backgroundBody = backgroundSource.replace(/^import\s+['"][^'"]+['"];\s*\r?\n/gm, '').trim();
sections.push(`// bundled entry: background.js\n${backgroundBody}\n`);

await writeFile(
  path.join(sourceDirectory, 'background-bundle.js'),
  `${sections.join('\n')}\n`,
  'utf8',
);
