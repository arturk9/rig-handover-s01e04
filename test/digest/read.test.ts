import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../../src/digest/read.js';

const tempDirs: string[] = [];

function makeRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('readNight', () => {
  it('aggregates runs by job and preserves nullable owners', () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      [
        '{"at":"2026-10-28T01:00:00+01:00","job":"worker","status":"retry","owner":"rook","error":"busy"}',
        '{"at":"2026-10-28T01:01:00+01:00","job":"worker","status":"ok","owner":"rook"}',
        '{"at":"2026-10-28T02:00:00+01:00","job":"unowned","status":"fail","owner":null,"error":"failed"}',
      ].join('\n'),
    );

    expect(readNight(runsDir, '2026-10-28')).toEqual({
      rows: [
        {
          job: 'worker',
          owner: 'rook',
          runs: 2,
          retries: 1,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T01:00:00+01:00',
          lastAt: '2026-10-28T01:01:00+01:00',
        },
        {
          job: 'unowned',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'failed',
          firstAt: '2026-10-28T02:00:00+01:00',
          lastAt: '2026-10-28T02:00:00+01:00',
        },
      ],
      badLines: 0,
    });
  });

  it('counts malformed and invalid records without losing valid runs', () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      [
        '{"at":"2026-10-28T01:00:00+01:00","job":"worker","status":"ok","owner":null}',
        '{not json}',
        '{"at":"now","job":"bad-status","status":"unknown","owner":"rook"}',
      ].join('\n'),
    );

    const digest = readNight(runsDir, '2026-10-28');
    expect(digest.badLines).toBe(2);
    expect(digest.rows).toHaveLength(1);
    expect(digest.rows[0]?.owner).toBeNull();
  });

  it('reads the sample night with five jobs and one malformed line', () => {
    const digest = readNight(join(process.cwd(), 'runs'), '2026-10-28');

    expect(digest.rows.map((row) => row.job).sort()).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(digest.badLines).toBe(1);
    expect(digest.rows.find((row) => row.job === 'digest/render')?.owner).toBeNull();
  });
});
