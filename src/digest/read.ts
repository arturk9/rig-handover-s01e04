import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest } from './types.js';

type Run = {
  at: string;
  job: string;
  status: DigestRow['lastStatus'];
  owner: string | null;
  error?: string;
};

function isRun(value: unknown): value is Run {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.at === 'string' &&
    typeof record.job === 'string' &&
    (record.status === 'ok' || record.status === 'retry' || record.status === 'fail') &&
    (typeof record.owner === 'string' || record.owner === null) &&
    (record.error === undefined || typeof record.error === 'string')
  );
}

export function readNight(runsDir: string, night: string): NightDigest {
  const contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');

  const rowsByJob = new Map<string, DigestRow>();
  let badLines = 0;

  const lines = contents === '' ? [] : contents.split(/\r?\n/);
  if (contents.endsWith('\n')) lines.pop();

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      badLines += 1;
      continue;
    }

    if (!isRun(parsed)) {
      badLines += 1;
      continue;
    }

    const previous = rowsByJob.get(parsed.job);
    if (previous === undefined) {
      rowsByJob.set(parsed.job, {
        job: parsed.job,
        owner: parsed.owner,
        runs: 1,
        retries: parsed.status === 'retry' ? 1 : 0,
        lastStatus: parsed.status,
        lastError: parsed.error ?? null,
        firstAt: parsed.at,
        lastAt: parsed.at,
      });
      continue;
    }

    previous.runs += 1;
    if (parsed.status === 'retry') previous.retries += 1;
    previous.lastStatus = parsed.status;
    previous.lastError = parsed.error ?? null;
    previous.lastAt = parsed.at;
    previous.owner = parsed.owner;
  }

  return { rows: [...rowsByJob.values()], badLines };
}
