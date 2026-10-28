# Wagering requirement calculator implementation plan

**Goal:** Build the requested zero-dependency, MIT, Node >=18 ESM package in this directory, with browser-compatible pure library exports and a manual-argument CLI.

**Authority:** The user's specification in this session. Work directly here; do not run git, publish, or install dependencies. The detailed request authorizes implementation without an additional approval round.

**Architecture:** Calculate credited wagering from bonus or deposit plus bonus, divide by contribution percentage for actual turnover, multiply turnover by house edge percentage for expected loss, and subtract loss from bonus for nominal EV. Use a pure 32-bit LCG step and a locally seeded binary-outcome simulation with gross payout, full deposit-plus-bonus starting bankroll, and fractional final/all-in bets. A trial succeeds when turnover reaches its target, including when its final bet loses the entire balance. Capped trials remain explicitly unresolved.

**Files:** `src/index.js` owns validated math, PRNG, simulation; `bin/wagering-requirement-calculator.js` owns Node I/O and argument parsing; `test/index.test.js` and `test/cli.test.js` own behavioral tests; `package.json`, `README.md`, `LICENSE` complete distribution.

**Constraints:** Zero dependencies; `type: module`; `license: MIT`; `engines.node: >=18`; `scripts.test: node --test test/`; no publish setup. README contains exactly one natural link, the user-specified guide; install from a caller-supplied real git checkout URL without inventing repository coordinates. Examples are explicitly hypothetical inputs. Responsible gambling: 18+, no strategy beats the house edge, consult local help resources.

**Review focus:** Reject non-finite numbers, invalid percentages and overflow; handle zero requirements and zero bankroll; preserve final-loss completion; reproduce seeds including zero; reject unknown/duplicate/missing CLI options and disclose capped simulation results.

## Task 1: Library
- [x] Write exact-math, invalid-input, pure PRNG, and simulation tests first; run `node --test test/index.test.js` and observe missing implementation.
- [x] Implement `calculateTurnover(options)`, `calculateExpectedLoss(turnover, houseEdge)`, `calculateExpectedValue(bonus, loss)`, `calculateBonus(options)`, `randomStep(seed)`, and `simulateRollover(options)`.
- [x] Run library tests and resolve failures. Use finite JS numbers without silent rounding or coercion; reject contribution zero because it cannot satisfy rollover.

## Task 2: CLI and distribution
- [x] Write subprocess CLI tests for JSON results, defaults, simulation reproducibility, help, malformed arguments, and nonzero exits; observe missing CLI failure.
- [x] Implement CLI, package metadata, MIT license, concise README with library/browser/CLI examples and explicit model limitations.
- [x] Run `npm test`, execute README examples, inspect package contents and README link count.

## Progress
- Planning: complete. All interfaces use percentages, not fractions. Simulation defaults: stake 1, payout 2, trials 1000, seed 1, maxBets 10000 per trial. No external entropy or shared state.

- Task 1: complete. Library tests observed failing with missing implementation, then passed. Final library coverage: 64 tests.
- Task 2: complete. CLI checks use real async subprocesses writing to temporary files because this environment rejects synchronous pipe capture; 21 CLI tests pass. Metadata, standalone source import, README link count and package dry run checked.
- Review: independent read-only review found decimal roundoff could misclassify completion. Both reproductions failed before the fix and passed after a relative completion tolerance was added. Genuine shortfalls at ordinary and tiny scales remain busted. No other actionable findings.
- Final verification: `npm test` passes; no git commands, dependency installation, publishing or remote writes performed.
