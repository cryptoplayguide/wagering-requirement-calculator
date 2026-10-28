// Percentages use 100 for 100%. All amounts use the same arbitrary currency unit.
function optionsObject(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
}

function nonnegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite nonnegative number`);
  }
}

function percentage(value, name, allowZero = true) {
  nonnegative(value, name);
  if (value > 100 || (!allowZero && value === 0)) {
    throw new RangeError(`${name} must be ${allowZero ? 'in [0, 100]' : 'in (0, 100]'}`);
  }
}

function finiteResult(value) {
  if (!Number.isFinite(value)) throw new RangeError('arithmetic overflow: result must be finite');
  return value;
}

function wagering(options) {
  optionsObject(options);
  const { bonus, deposit = 0, multiplier, basis = 'bonus', contribution = 100 } = options;
  nonnegative(bonus, 'bonus');
  nonnegative(deposit, 'deposit');
  nonnegative(multiplier, 'multiplier');
  percentage(contribution, 'contribution', false);
  if (basis !== 'bonus' && basis !== 'deposit+bonus') {
    throw new RangeError('basis must be bonus or deposit+bonus');
  }
  const bankroll = finiteResult(deposit + bonus);
  const wageringRequirement = finiteResult((basis === 'bonus' ? bonus : bankroll) * multiplier);
  const turnover = wageringRequirement === 0 ? 0 : finiteResult(wageringRequirement / (contribution / 100));
  return { bonus, bankroll, wageringRequirement, turnover };
}

/** Actual turnover needed to satisfy a credited wagering requirement. */
export function calculateTurnover(options) {
  return wagering(options).turnover;
}

/** Unconditional expected cost for a specified amount of actual turnover. */
export function calculateExpectedLoss(turnover, houseEdge) {
  nonnegative(turnover, 'turnover');
  percentage(houseEdge, 'houseEdge');
  return finiteResult(turnover * (houseEdge / 100));
}

/** Nominal bonus value less expected wagering cost; may be negative. */
export function calculateExpectedValue(bonus, loss) {
  nonnegative(bonus, 'bonus');
  nonnegative(loss, 'loss');
  return bonus - loss;
}

/** Full cost report; assumes the bonus is cashable after completing rollover. */
export function calculateBonus(options) {
  const { bonus, wageringRequirement, turnover } = wagering(options);
  const expectedLoss = calculateExpectedLoss(turnover, options.houseEdge);
  return {
    wageringRequirement,
    turnover,
    expectedLoss,
    expectedValue: calculateExpectedValue(bonus, expectedLoss),
  };
}

/** Pure LCG transition: next uint32 state and a uniform value in [0, 1). */
export function randomStep(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed must be an integer in [0, 4294967295]');
  }
  const state = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { state, value: state / 4294967296 };
}

function positive(value, name) {
  nonnegative(value, name);
  if (value === 0) throw new RangeError(`${name} must be positive`);
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

/**
 * Binary independent wagers: win probability = (1 - edge/100) / gross payout.
 * Start with deposit + bonus. Bet min(stake, balance, remaining turnover).
 * maxBets caps each trial; unresolved trials produce bounds, not a point estimate.
 * Only local state changes: the same options always produce the same result.
 */
export function simulateRollover(options) {
  const { bankroll, turnover } = wagering(options);
  const {
    houseEdge, stake = 1, payout = 2, trials = 1000, seed = 1, maxBets = 10000,
  } = options;
  percentage(houseEdge, 'houseEdge');
  positive(stake, 'stake');
  nonnegative(payout, 'payout');
  if (payout <= 1) throw new RangeError('payout must be greater than 1 (gross return including stake)');
  positiveInteger(trials, 'trials');
  positiveInteger(maxBets, 'maxBets');
  randomStep(seed); // Validate even when no bets are needed; do not consume a draw.

  const winProbability = (1 - houseEdge / 100) / payout;
  let state = seed;
  let completed = 0;
  let busted = 0;
  let truncated = 0;

  for (let trial = 0; trial < trials; trial++) {
    let balance = bankroll;
    let remaining = turnover;
    for (let bets = 0; bets < maxBets && remaining > 0 && balance > 0; bets++) {
      const bet = Math.min(stake, balance, remaining);
      const nextRemaining = remaining - bet;
      if (nextRemaining === remaining) {
        throw new RangeError('stake is too small to advance turnover at this numeric precision');
      }
      const next = randomStep(state);
      state = next.state;
      balance = finiteResult(next.value < winProbability
        ? balance + bet * (payout - 1)
        : balance - bet);
      // Treat a few rounding units of the current remainder as settled. This
      // handles e.g. 0.1 + 0.7 versus 0.1 * 8 without a currency-sized epsilon.
      remaining = nextRemaining <= 4 * Number.EPSILON * remaining ? 0 : nextRemaining;
    }
    if (remaining === 0) completed++;
    else if (balance === 0) busted++;
    else truncated++;
  }

  return {
    trials,
    completed,
    busted,
    truncated,
    probability: truncated === 0 ? completed / trials : null,
    probabilityLowerBound: completed / trials,
    probabilityUpperBound: (completed + truncated) / trials,
  };
}
