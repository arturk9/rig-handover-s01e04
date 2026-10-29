import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const tempDirs: string[] = [];

function makeRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-api-'));
  tempDirs.push(dir);
  return dir;
}

function appFor(runsDir: string) {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('digest JSON API', () => {
  it('returns rows sorted by job', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      [
        '{"at":"2026-10-28T01:00:00+01:00","job":"zeta","status":"ok","owner":"rook"}',
        '{"at":"2026-10-28T02:00:00+01:00","job":"alpha","status":"fail","owner":null,"error":"failed"}',
      ].join('\n'),
    );

    const response = await appFor(runsDir).request('/api/digest/2026-10-28');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([{ job: 'alpha' }, { job: 'zeta' }]);
  });

  it('returns the sample night jobs in page order', async () => {
    const response = await appFor(join(process.cwd(), 'runs')).request(
      '/api/digest/2026-10-28',
    );
    const rows = await response.json();

    expect(response.status).toBe(200);
    expect(rows.map((row: { job: string }) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('returns 404 for a missing or invalid night', async () => {
    const app = appFor(makeRunsDir());

    expect((await app.request('/api/digest/2026-10-27')).status).toBe(404);
    expect((await app.request('/api/digest/../secret')).status).toBe(404);
  });

  it('returns an empty digest for an empty night', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');

    const response = await appFor(runsDir).request('/api/digest/2026-10-28');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('keeps valid rows and reports malformed lines', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      '{"at":"2026-10-28T01:00:00+01:00","job":"worker","status":"ok","owner":null}\n{bad json}',
    );

    const response = await appFor(runsDir).request('/api/digest/2026-10-28');
    const rows = await response.json();

    expect(response.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].job).toBe('worker');
  });
});
