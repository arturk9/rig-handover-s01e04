import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const tempDirs: string[] = [];

function makeRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(dir);
  return dir;
}

function makeApp(runsDir: string) {
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

describe('digest routes', () => {
  it('renders an existing night as a page', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-29.jsonl'),
      '{"at":"2026-10-29T01:00:00+01:00","job":"worker","status":"ok","owner":"rook"}',
    );

    const response = await makeApp(runsDir).request('/digest/2026-10-29');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('worker');
  });

  it('returns rows as JSON for an existing night', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-29.jsonl'),
      '{"at":"2026-10-29T01:00:00+01:00","job":"worker","status":"ok","owner":"rook"}',
    );

    const response = await makeApp(runsDir).request('/api/digest/2026-10-29');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        job: 'worker',
        owner: 'rook',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-29T01:00:00+01:00',
        lastAt: '2026-10-29T01:00:00+01:00',
      },
    ]);
  });

  it('returns 404 for a missing night page', async () => {
    const response = await makeApp(makeRunsDir()).request('/digest/2026-10-30');

    expect(response.status).toBe(404);
  });

  it('returns 404 for missing night JSON', async () => {
    const response = await makeApp(makeRunsDir()).request('/api/digest/2026-10-30');

    expect(response.status).toBe(404);
  });

  it('renders an empty night page', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');

    const response = await makeApp(runsDir).request('/digest/2026-10-29');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('nothing ran');
  });

  it('returns an empty digest for an empty night', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');

    const response = await makeApp(runsDir).request('/api/digest/2026-10-29');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('renders valid rows when a night contains a malformed line', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-29.jsonl'),
      [
        '{"at":"2026-10-29T01:00:00+01:00","job":"worker","status":"ok","owner":null}',
        '{not json}',
      ].join('\n'),
    );

    const response = await makeApp(runsDir).request('/digest/2026-10-29');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('worker');
  });

  it('counts malformed lines in the JSON digest without dropping valid rows', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-29.jsonl'),
      [
        '{"at":"2026-10-29T01:00:00+01:00","job":"worker","status":"ok","owner":null}',
        '{not json}',
      ].join('\n'),
    );

    const response = await makeApp(runsDir).request('/api/digest/2026-10-29');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        job: 'worker',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-29T01:00:00+01:00',
        lastAt: '2026-10-29T01:00:00+01:00',
      },
    ]);
  });
});
