# wagering-requirement-calculator

Small, zero-dependency JavaScript package for bonus rollover cost and a seedable Monte Carlo estimate of completion probability. Node.js 18+ ESM; the pure library functions also work in browsers.

For background on contribution rates and rollover terms, see the [crypto casino wagering requirements guide](https://cryptoplay.guide/guides/crypto-casino-wagering-requirements/).

## Install from git

Use the actual clone URL of the repository containing this package:

```sh
npm install 'git+<repository-clone-url>'
```

Replace the placeholder with that repository's real clone URL. To work from an existing checkout, run `npm install /absolute/path/to/wagering-requirement-calculator` in the consuming project. No dependency installation or build step is needed to run the source CLI or tests in this repository.

## Library

The following inputs are hypothetical arithmetic examples, not casino offers or observed play results. Amounts must use the same currency unit. Percentages use `100` for 100%, `20` for 20%, and `1` for 1%.

```js
import {
  calculateBonus,
  calculateTurnover,
  calculateExpectedLoss,
  calculateExpectedValue,
  simulateRollover,
  randomStep,
} from 'wagering-requirement-calculator';

const offer = {
  bonus: 100,
  deposit: 100,
  multiplier: 30,
  basis: 'bonus',
  contribution: 100,
  houseEdge: 1,
};

console.log(calculateBonus(offer));
// { wageringRequirement: 3000, turnover: 3000,
//   expectedLoss: 30, expectedValue: 70 }

calculateTurnover({ ...offer, basis: 'deposit+bonus', contribution: 25 });
// 24000 actual turnover (6000 credited wagering / 0.25)
calculateExpectedLoss(24000, 1); // 240
calculateExpectedValue(100, 240); // -140

const estimate = simulateRollover({
  ...offer, stake: 1, payout: 2, trials: 1000, seed: 42, maxBets: 10000,
});
console.log(estimate);

// Pure PRNG step: save the returned state for the next draw.
const { state, value } = randomStep(0);
console.log(state, value); // 1013904223, 0.23606797284446657
```

From this checkout, import from `./src/index.js` instead. In a browser, serve the checkout over HTTP and use a module script:

```html
<script type="module">
  import { calculateBonus } from './src/index.js';
  console.log(calculateBonus({ bonus: 100, multiplier: 30, houseEdge: 1 }));
</script>
```

### Calculations and inputs

| Function | Result |
| --- | --- |
| `calculateTurnover(options)` | Actual amount that must be bet, accounting for contribution |
| `calculateExpectedLoss(turnover, houseEdge)` | `turnover * (houseEdge / 100)` |
| `calculateExpectedValue(bonus, loss)` | `bonus - loss`, including negative values |
| `calculateBonus(options)` | `{ wageringRequirement, turnover, expectedLoss, expectedValue }` |
| `simulateRollover(options)` | Seeded completion counts, probability estimate and bounds |
| `randomStep(seed)` | `{ state, value }` for the next deterministic PRNG draw |

`bonus` and `multiplier` are required nonnegative finite numbers. `deposit` defaults to `0`; `basis` defaults to `'bonus'` and also accepts `'deposit+bonus'`. The credited `wageringRequirement` is `bonus * multiplier` or `(deposit + bonus) * multiplier`. Actual `turnover` is `wageringRequirement / (contribution / 100)`; contribution defaults to `100` and must be greater than zero and at most `100`. A zero-contribution game cannot satisfy rollover and is rejected. A zero bonus or multiplier can produce zero required turnover.

`houseEdge` is required by the cost report and simulation, with a range of `0` to `100` inclusive. It is the edge on actual bets, before the contribution adjustment. Standalone loss and EV helpers require nonnegative finite arguments; EV itself can be negative. The library rejects numeric strings, malformed options and arithmetic overflow. Invalid inputs throw `TypeError` or `RangeError`. Inputs are never mutated, and no function reads external randomness, time, browser globals or Node APIs.

Calculations use JavaScript floating-point numbers without currency rounding. They are not an exact decimal ledger. Very large or small magnitudes can lose precision; simulation rejects stakes too small to advance the remaining turnover and treats a residual within `4 * Number.EPSILON` times the pre-bet remaining turnover as complete to absorb ordinary decimal roundoff. Use consistent units and round only for presentation.

### Simulation model and limits

Each trial starts with `deposit + bonus`. Bets are independent binary outcomes: a win returns `payout` times the stake **including** that stake, and a loss returns zero. The win probability is `(1 - houseEdge / 100) / payout`, so the expected loss per bet matches the specified edge. `payout` must be a finite number greater than `1` and defaults to `2`. House edge alone does not determine completion probability: the payout distribution, stake and starting balance also matter.

`stake` defaults to `1` and must be positive and finite. Each bet is the smaller of the target stake, current balance and remaining actual turnover. This permits fractional final bets and all-in bets below the target stake. Completion is checked after crediting a bet's turnover, even if that final bet loses the entire balance. A trial that runs out of balance before completion is busted. No additional deposits are allowed.

`trials` defaults to `1000`; `maxBets` defaults to `10000` per trial. Both must be positive safe integers. The simulator runs synchronously with work up to `trials * maxBets`; use small limits in browser interfaces or run it in a worker. `seed` defaults to `1` and must be an integer from `0` through `4294967295`. The pure 32-bit LCG uses `state = (1664525 * state + 1013904223) mod 2^32` and `value = state / 2^32`. State advances across trials in a call; calls are independent and the same inputs reproduce the same results. This simple PRNG is for modeling, not secure randomness or game verification.

The result contains `trials`, `completed`, `busted`, `truncated`, `probability`, `probabilityLowerBound` and `probabilityUpperBound`. Counts sum to `trials`. If no trials are truncated, `probability` is `completed / trials`. Otherwise it is `null`, with bounds `completed / trials` through `(completed + truncated) / trials`. These are bounds for unresolved sampled trials, **not statistical confidence intervals**. Monte Carlo estimates have sampling error and do not guarantee real-world outcomes. Zero required turnover completes immediately.

Nominal EV assumes a cashable bonus and enough bankroll to place all required turnover. It does not incorporate early ruin, bonus forfeiture, cashout caps, fees, taxes, stake limits, time limits, excluded games, changing contribution rates or operator-specific rules. The simulation estimates completion only; it does not turn nominal EV into a withdrawable profit forecast. Check the actual offer terms and supply the relevant inputs. This package provides arithmetic, not gambling recommendations.

## CLI

Run directly from a checkout:

```sh
node bin/wagering-requirement-calculator.js \
  --bonus 100 --deposit 100 --multiplier 30 \
  --basis deposit+bonus --contribution 25 --house-edge 1
```

JSON output:

```json
{
  "wageringRequirement": 6000,
  "turnover": 24000,
  "expectedLoss": 240,
  "expectedValue": -140
}
```

After installation, the same command is available as `wagering-requirement-calculator` through your package manager's local executable path (for example, in an npm script).

```sh
node bin/wagering-requirement-calculator.js \
  --bonus 100 --deposit 100 --multiplier 30 --house-edge 1 \
  --simulate --stake 1 --payout 2 --trials 1000 --seed 42 --max-bets 10000

node bin/wagering-requirement-calculator.js --help
```

`--simulate` adds a `simulation` object to the cost report. Simulation-only options require that flag. The CLI accepts `--name value` and `--name=value`; it rejects unknown or duplicate options, missing values and invalid inputs with a message on stderr and exit code `1`. Successful output is JSON on stdout; help is plain text.

## Tests

```sh
npm test
```

Uses `node --test test/`, with no test dependencies. Tests cover exact arithmetic, validation, hand-traced seeded outcomes, an analytic probability check, capped trials and CLI behavior.

## Responsible gambling

18+ only. No strategy beats the house edge. If gambling causes harm or feels difficult to control, stop and contact local help resources, such as your local gambling support service, a community counselor or a public health service.

## License

MIT. Copyright (c) 2026 CryptoPlay Guide.
