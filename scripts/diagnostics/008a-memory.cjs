/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS diagnostic loads the compiled CommonJS API. */
// Controlled Promise/deadline model; no HTTP or DB load. Requires node --expose-gc.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const [label, date] = process.argv.slice(2);
if (!['before', 'after'].includes(label) || !date || !global.gc) {
  throw new Error(
    'Usage: node --expose-gc scripts/diagnostics/008a-memory.cjs before|after YYYY-MM-DD',
  );
}
const compiled = path.join(root, 'apps/api/dist/database/readiness.service.js');
const { ReadinessService } = require(compiled);
let release;
const raw = new Promise((resolve) => {
  release = resolve;
});
let calls = 0,
  rawSubscriptions = 0,
  derivedSubscriptions = 0,
  derived;
const service = new ReadinessService({
  $transaction() {
    calls++;
    return raw;
  },
});
const then = Promise.prototype.then;
const timer = global.setTimeout;
const clear = global.clearTimeout;
Promise.prototype.then = function (...args) {
  const result = then.apply(this, args);
  if (this === raw) {
    rawSubscriptions++;
    derived = result;
  } else if (this === derived) derivedSubscriptions++;
  return result;
};
// Deadlines expire in microtasks. Do not interpret model counts as request capacity.
global.setTimeout = (callback) => {
  queueMicrotask(callback);
  return 0;
};
global.clearTimeout = () => {};
function heap() {
  for (let i = 0; i < 3; i++) global.gc();
  return process.memoryUsage().heapUsed;
}
(async () => {
  const samples = [{ probes: 0, heapBytes: heap() }];
  try {
    for (let batch = 1; batch <= 3; batch++) {
      for (let i = 0; i < 5000; i++) {
        if ((await service.isReady()) !== false)
          throw new Error('Expected deadline false');
      }
      samples.push({
        probes: batch * 5000,
        heapBytes: heap(),
        calls,
        rawSubscriptions,
        derivedSubscriptions,
      });
    }
    release();
    await new Promise((resolve) => setImmediate(resolve));
    samples.push({ stage: 'operation settled', heapBytes: heap(), calls });
  } finally {
    Promise.prototype.then = then;
    global.setTimeout = timer;
    global.clearTimeout = clear;
  }
  const data = {
    date,
    label,
    head: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    compiledSha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(compiled))
      .digest('hex'),
    scope:
      '15000 probes, accelerated timer model, forced GC; no HTTP or PostgreSQL requests',
    samples,
  };
  const output = path.join(
    root,
    'docs/practice/PM04/evidence',
    `008a-memory-${label}.json`,
  );
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify(data));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
