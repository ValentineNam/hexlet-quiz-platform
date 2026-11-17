import { afterEach, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service';

afterEach(() => vi.unstubAllEnvs());
it.each([
  '',
  'not-a-url',
  'mysql://user:private-password@localhost/db',
  'postgresql://localhost',
])('rejects invalid DB config without exposing it: case %#', (url) => {
  vi.stubEnv('DATABASE_URL', url);
  let caught: unknown;
  try {
    new PrismaService();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  if (!(caught instanceof Error))
    throw new Error('Expected configuration error');
  expect(caught.message).not.toMatch(/private-password|not-a-url|mysql:\/\//);
});
