import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTurnover,
  calculateExpectedLoss,
  calculateExpectedValue,
  calculateBonus,
  randomStep,
  simulateRollover,
} from '../src/index.js';

const offer = Object.freeze({ bonus: 100, deposit: 100, multiplier: 30, houseEdge: 1 });
const simulation = Object.freeze({
  bonus: 1, deposit: 0, multiplier: 2, houseEdge: 0,
  stake: 1, payout: 2, trials: 4, seed: 1, maxBets: 10,
});

for (const [name, options, expected] of [
  ['bonus-only basis', offer, 3000],
  ['deposit plus bonus basis', { ...offer, basis: 'deposit+bonus' }, 6000],
  ['partial game contribution', { ...offer, contribution: 20 }, 15000],
  ['basis and contribution together', { ...offer, basis: 'deposit+bonus', contribution: 25 }, 24000],
  ['no deposit default', { bonus: 100, multiplier: 30 }, 3000],
  ['zero multiplier', { ...offer, multiplier: 0 }, 0],
  ['zero bonus', { ...offer, bonus: 0 }, 0],
  ['deposit still counts on combined basis', { ...offer, bonus: 0, basis: 'deposit+bonus' }, 3000],
  ['fractional amounts and multiplier', { bonus: 12.5, multiplier: 2.5, contribution: 50 }, 62.5],
]) {
  test(`turnover: ${name}`, () => assert.equal(calculateTurnover(options), expected));
}

test('loss and nominal bonus EV have exact, independently calculated values', () => {
  assert.equal(calculateExpectedLoss(3000, 1), 30);
  assert.equal(calculateExpectedLoss(1250, 2), 25);
  assert.equal(calculateExpectedLoss(100, 0), 0);
  assert.equal(calculateExpectedLoss(100, 100), 100);
  assert.equal(calculateExpectedLoss(0, 10), 0);
  assert.equal(calculateExpectedValue(100, 30), 70);
  assert.equal(calculateExpectedValue(100, 150), -50);
  assert.equal(calculateExpectedValue(0, 0), 0);
});

test('combined report distinguishes credited requirement from actual turnover', () => {
  const input = Object.freeze({ ...offer, basis: 'deposit+bonus', contribution: 25 });
  assert.deepEqual(calculateBonus(input), {
    wageringRequirement: 6000, turnover: 24000, expectedLoss: 240, expectedValue: -140,
  });
  assert.deepEqual(calculateBonus(offer), {
    wageringRequirement: 3000, turnover: 3000, expectedLoss: 30, expectedValue: 70,
  });
  assert.equal(input.contribution, 25);
});

for (const field of ['bonus', 'deposit', 'multiplier', 'contribution', 'houseEdge']) {
  for (const value of [NaN, Infinity, -Infinity, -1, '1', null]) {
    test(`rejects invalid ${field}: ${String(value)} (${typeof value})`, () => {
      assert.throws(() => calculateBonus({ ...offer, [field]: value }), /./);
    });
  }
}

test('rejects invalid basis, percentages, missing inputs and non-objects', () => {
  for (const basis of ['deposit', '', 1, null]) {
    assert.throws(() => calculateTurnover({ ...offer, basis }), /basis/);
  }
  for (const contribution of [0, 100.1]) {
    assert.throws(() => calculateTurnover({ ...offer, contribution }), /contribution/);
  }
  assert.throws(() => calculateBonus({ ...offer, houseEdge: 101 }), /houseEdge/);
  for (const value of [undefined, null, [], 'x', 4]) {
    assert.throws(() => calculateBonus(value), /./);
    assert.throws(() => calculateTurnover(value), /./);
    assert.throws(() => simulateRollover(value), /./);
  }
  assert.throws(() => calculateTurnover({ bonus: 1 }), /multiplier/);
  assert.throws(() => calculateTurnover({ multiplier: 1 }), /bonus/);
  assert.throws(() => calculateBonus({ bonus: 1, multiplier: 1 }), /houseEdge/);
});

test('standalone math helpers reject invalid input', () => {
  for (const bad of [-1, NaN, Infinity, '2', null, undefined]) {
    assert.throws(() => calculateExpectedLoss(bad, 1), /turnover/);
    assert.throws(() => calculateExpectedLoss(1, bad), /houseEdge/);
    assert.throws(() => calculateExpectedValue(bad, 1), /bonus/);
    assert.throws(() => calculateExpectedValue(1, bad), /loss/);
  }
  assert.throws(() => calculateExpectedLoss(1, 101), /houseEdge/);
});

test('rejects arithmetic overflow rather than returning Infinity', () => {
  assert.throws(() => calculateTurnover({ bonus: 1e308, multiplier: 30 }), /finite|overflow/);
  assert.throws(() => calculateTurnover({ bonus: 1e308, deposit: 1e308, multiplier: 1 }), /finite|overflow/);
  assert.throws(() => calculateTurnover({ bonus: 1e308, multiplier: 1, contribution: 1 }), /finite|overflow/);
  // Divide the percentage first: the mathematical result is finite.
  assert.equal(calculateExpectedLoss(1e308, 100), 1e308);
});

test('PRNG has a reproducible, pure uint32 state transition including seed zero', () => {
  const first = randomStep(0);
  assert.deepEqual(first, { state: 1013904223, value: 1013904223 / 4294967296 });
  assert.deepEqual(randomStep(first.state), { state: 1196435762, value: 1196435762 / 4294967296 });
  assert.deepEqual(randomStep(0), first);
  for (const seed of [0, 1, 4294967295]) {
    const result = randomStep(seed);
    assert.ok(Number.isInteger(result.state));
    assert.ok(result.value >= 0 && result.value < 1);
  }
  for (const seed of [-1, 0.5, 4294967296, NaN, Infinity, '1', null, undefined]) {
    assert.throws(() => randomStep(seed), /seed/);
  }
});

test('seeded four-trial model agrees with hand-traced win/loss paths', () => {
  // Seed 1 uniforms begin .236, .369, .504, .704, .050, .369.
  // Two bets required: WW succeeds, L fails, L fails, WW succeeds.
  const expected = {
    trials: 4, completed: 2, busted: 2, truncated: 0,
    probability: 0.5, probabilityLowerBound: 0.5, probabilityUpperBound: 0.5,
  };
  assert.deepEqual(simulateRollover(simulation), expected);
  assert.deepEqual(simulateRollover(simulation), expected);
  assert.equal(simulation.seed, 1);
});

test('Monte Carlo agrees with exact one-step survival probability', () => {
  // Bankroll 1, two unit bets: survival requires winning the first bet.
  // A 10% edge and gross payout 3 gives P(win) = 0.9 / 3 = 0.3.
  const result = simulateRollover({ ...simulation, houseEdge: 10, payout: 3, trials: 20000 });
  assert.ok(Math.abs(result.probability - 0.3) < 0.015);
  assert.equal(result.completed + result.busted, 20000);
});

test('final losing bet counts toward completion even with zero ending balance', () => {
  const result = simulateRollover({ ...simulation, multiplier: 1, houseEdge: 100 });
  assert.equal(result.completed, 4);
  assert.equal(result.probability, 1);
});

test('certain losses bust before an unmet requirement', () => {
  const result = simulateRollover({ ...simulation, houseEdge: 100 });
  assert.equal(result.busted, 4);
  assert.equal(result.probability, 0);
});

test('starting bankroll includes deposit and bonus', () => {
  const result = simulateRollover({ ...simulation, deposit: 1, houseEdge: 100 });
  assert.equal(result.completed, 4);
});

test('simulation applies combined basis and partial contribution', () => {
  const result = simulateRollover({
    ...simulation, deposit: 1, multiplier: 1, basis: 'deposit+bonus', contribution: 50, houseEdge: 100,
  });
  assert.equal(result.busted, 4);
  assert.equal(result.completed, 0);
});

test('zero requirement completes immediately, including an empty bankroll', () => {
  for (const overrides of [{ multiplier: 0 }, { bonus: 0, deposit: 0 }]) {
    const result = simulateRollover({ ...simulation, ...overrides });
    assert.equal(result.probability, 1);
    assert.equal(result.completed, 4);
  }
});

test('last and all-in bets can be smaller than the requested stake', () => {
  assert.equal(simulateRollover({
    ...simulation, bonus: 1.5, multiplier: 1, houseEdge: 100,
  }).probability, 1);
  assert.equal(simulateRollover({
    ...simulation, stake: 2, multiplier: 1, houseEdge: 100,
  }).probability, 1);
});

test('capped trials report unresolved probability bounds, not losses', () => {
  // First draw wins; still needs a second bet when capped.
  assert.deepEqual(simulateRollover({ ...simulation, trials: 1, maxBets: 1 }), {
    trials: 1, completed: 0, busted: 0, truncated: 1,
    probability: null, probabilityLowerBound: 0, probabilityUpperBound: 1,
  });
  assert.deepEqual(simulateRollover({ ...simulation, maxBets: 1 }), {
    trials: 4, completed: 0, busted: 2, truncated: 2,
    probability: null, probabilityLowerBound: 0, probabilityUpperBound: 0.5,
  });
});

test('simulation defaults and seed zero are deterministic', () => {
  const input = { bonus: 1, multiplier: 1, houseEdge: 100 };
  assert.equal(simulateRollover(input).trials, 1000);
  assert.equal(simulateRollover(input).probability, 1);
  assert.deepEqual(simulateRollover({ ...simulation, seed: 0 }), simulateRollover({ ...simulation, seed: 0 }));
});

for (const [field, values] of [
  ['stake', [0, -1, Infinity, NaN, '1', null]],
  ['payout', [0, 1, -2, Infinity, NaN, '2', null]],
  ['trials', [0, -1, 1.5, Infinity, NaN, '4', null, Number.MAX_SAFE_INTEGER + 1]],
  ['maxBets', [0, -1, 1.5, Infinity, NaN, '4', null, Number.MAX_SAFE_INTEGER + 1]],
  ['seed', [-1, 0.5, 4294967296, Infinity, NaN, '1', null]],
]) {
  test(`simulation validates ${field}`, () => {
    for (const value of values) {
      assert.throws(() => simulateRollover({ ...simulation, [field]: value }), new RegExp(field));
    }
  });
}

test('simulation rejects bets too tiny to advance turnover', () => {
  assert.throws(() => simulateRollover({ ...simulation, stake: Number.MIN_VALUE }), /precision|advance/);
});

test('decimal roundoff does not turn a fully funded final loss into ruin', () => {
  // 0.1 + 0.7 and 0.1 * 8 both represent 0.8 mathematically.
  const result = simulateRollover({
    bonus: 0.1, deposit: 0.7, multiplier: 8,
    houseEdge: 100, stake: 1, trials: 1,
  });
  assert.equal(result.completed, 1);
  assert.equal(result.busted, 0);
  assert.equal(result.probability, 1);
});

test('decimal roundoff does not add a bet to a three-bet requirement', () => {
  const result = simulateRollover({
    bonus: 0.1, deposit: 1, multiplier: 3,
    houseEdge: 100, stake: 0.1, trials: 1, maxBets: 3,
  });
  assert.equal(result.completed, 1);
  assert.equal(result.truncated, 0);
});

test('completion tolerance preserves genuine shortfalls at ordinary and tiny scales', () => {
  for (const overrides of [
    { bonus: 0.1, deposit: 0.69, multiplier: 8 },
    { bonus: 0.1, deposit: 0.7 - 1e-12, multiplier: 8 },
    { bonus: 1e-20, deposit: 0, multiplier: 2 },
  ]) {
    const result = simulateRollover({ ...overrides, houseEdge: 100, trials: 1 });
    assert.equal(result.completed, 0);
    assert.equal(result.busted, 1);
  }
});
