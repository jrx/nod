import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export function affectedTests(base, available) {
  const cli = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')));
  const config = fileURLToPath(new URL('../vitest.config.mts', import.meta.url));
  const selected = JSON.parse(
    execFileSync(
      process.execPath,
      [cli, 'list', '--config', config, '--changed', base, '--filesOnly', '--json'],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    ),
  );
  if (!Array.isArray(selected) || selected.some((entry) => typeof entry.file !== 'string'))
    throw new Error('Vitest returned an invalid test file selection.');
  return selected
    .map(({ file }) => relative(process.cwd(), file))
    .filter((file) => available.includes(file));
}

export async function orderTests(files, timings = {}) {
  if (!files.length) return [];
  const weighted = await Promise.all(
    files.map(async (file) => ({
      file,
      weight:
        Number.isFinite(timings[file]) && timings[file] > 0
          ? timings[file]
          : Math.max(1000, (await stat(file)).size / 10),
    })),
  );
  weighted.sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file));
  return weighted.map(({ file }) => file);
}

export async function readTimings(...directories) {
  const timings = {};
  for (const directory of directories) {
    for (const name of await readdir(directory).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return [];
    })) {
      if (!name.endsWith('.json')) continue;
      const entries = JSON.parse(await readFile(`${directory}/${name}`, 'utf8'));
      for (const [file, time] of Object.entries(entries))
        if (/^tests\/[^/]+\.test\.ts$/.test(file) && Number.isFinite(time) && time > 0)
          timings[file] = time;
    }
  }
  return timings;
}

if (import.meta.main) {
  const directory = process.env.CI_TEST_TIMINGS;
  const timings = await readTimings(directory, process.env.CI_NEW_TEST_TIMINGS);
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/timings.json`, JSON.stringify(timings));
}
