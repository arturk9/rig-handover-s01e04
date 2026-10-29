import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './read.js';

export function createDigestApi(config: RigConfig) {
  const app = new Hono();

  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return c.notFound();

    try {
      const { rows } = readNight(config.runsDir, night);
      rows.sort((a, b) => a.job.localeCompare(b.job));
      return c.json(rows);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return c.notFound();
      }

      throw error;
    }
  });

  return app;
}
