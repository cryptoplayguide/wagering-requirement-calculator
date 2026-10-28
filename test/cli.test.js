import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/wagering-requirement-calculator.js', import.meta.url));
const base = ['--bonus', '100', '--deposit', '100', '--multiplier', '30', '--house-edge', '1'];
async function run(args) {
  // File descriptors also work in sandboxes that cannot capture child pipes.
  const directory = mkdtempSync(join(tmpdir(), 'wagering-cli-test-'));
  const outPath = join(directory, 'stdout');
  const errPath = join(directory, 'stderr');
  const outFd = openSync(outPath, 'w');
  const errFd = openSync(errPath, 'w');
  try {
    const child = spawn(process.execPath, [cli, ...args], {
      stdio: ['ignore', outFd, errFd], timeout: 5000,
    });
    const [status, signal] = await once(child, 'close');
    assert.equal(signal, null, 'CLI must exit before the timeout');
    return { status, stdout: readFileSync(outPath, 'utf8'), stderr: readFileSync(errPath, 'utf8') };
  } finally {
    closeSync(outFd);
    closeSync(errFd);
    rmSync(directory, { recursive: true, force: true });
  }
}

test('CLI prints exact cost report as JSON', async () => {
  const result = await run([...base, '--basis', 'deposit+bonus', '--contribution', '25']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    wageringRequirement: 6000, turnover: 24000, expectedLoss: 240, expectedValue: -140,
  });
});

test('CLI accepts equals syntax and decimal scientific numbers', async () => {
  const result = await run(['--bonus=1e2', '--multiplier=30', '--house-edge=1']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    wageringRequirement: 3000, turnover: 3000, expectedLoss: 30, expectedValue: 70,
  });
});

test('CLI seeded simulation is reproducible across processes', async () => {
  const args = ['--bonus', '1', '--multiplier', '2', '--house-edge', '0', '--simulate', '--trials', '4', '--seed', '1'];
  const first = await run(args);
  const second = await run(args);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.deepEqual(JSON.parse(first.stdout).simulation, {
    trials: 4, completed: 2, busted: 2, truncated: 0,
    probability: 0.5, probabilityLowerBound: 0.5, probabilityUpperBound: 0.5,
  });
});

test('CLI exposes capped trials without serializing a misleading probability', async () => {
  const result = await run([
    '--bonus', '1', '--multiplier', '2', '--house-edge', '0', '--simulate',
    '--trials', '1', '--seed', '1', '--max-bets', '1', '--stake', '1', '--payout', '2',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).simulation, {
    trials: 1, completed: 0, busted: 0, truncated: 1,
    probability: null, probabilityLowerBound: 0, probabilityUpperBound: 1,
  });
});

test('CLI help works without required calculation inputs', async () => {
  for (const args of [['--help'], ['-h']]) {
    const result = await run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /--contribution/);
    assert.match(result.stdout, /--simulate/);
    assert.match(result.stdout, /--max-bets/);
    assert.equal(result.stderr, '');
  }
});

for (const [name, args, error] of [
  ['no inputs', [], /bonus/],
  ['missing required input', ['--bonus', '100'], /multiplier/],
  ['missing option value', [...base, '--contribution'], /value/],
  ['following option instead of value', [...base, '--contribution', '--simulate'], /value/],
  ['empty value', [...base, '--contribution='], /value|number/],
  ['unknown option', [...base, '--unknown', '1'], /unknown/i],
  ['positional argument', [...base, 'oops'], /argument|option/i],
  ['duplicate option', [...base, '--bonus=2'], /duplicate/i],
  ['duplicate flag', [...base, '--simulate', '--simulate'], /duplicate/i],
  ['valued flag', [...base, '--simulate=true'], /value/i],
  ['simulation option without flag', [...base, '--seed', '0'], /simulate/],
  ['non-numeric input', [...base, '--contribution', 'oops'], /number/],
  ['infinite input', [...base, '--contribution', 'Infinity'], /number/],
  ['hexadecimal input', [...base, '--contribution', '0x10'], /number/],
  ['invalid percentage', [...base, '--contribution', '101'], /contribution/],
  ['negative amount', ['--bonus', '-1', '--multiplier', '2', '--house-edge', '1'], /bonus/],
]) {
  test(`CLI rejects ${name} with a useful error and nonzero exit`, async () => {
    const result = await run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, error);
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  });
}
