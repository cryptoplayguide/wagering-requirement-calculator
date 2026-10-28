#!/usr/bin/env node
import { calculateBonus, simulateRollover } from '../src/index.js';

const help = `Usage: wagering-requirement-calculator --bonus N --multiplier N --house-edge N [options]

Required:
  --bonus N          Bonus amount
  --multiplier N     Rollover multiplier
  --house-edge N     House edge percentage (1 means 1%)

Cost options:
  --deposit N        Deposit amount (default 0)
  --basis NAME       bonus (default) or deposit+bonus
  --contribution N   Game contribution percentage (default 100, must be >0)

Simulation:
  --simulate         Include a seeded binary-outcome Monte Carlo estimate
  --stake N          Target stake; final/all-in bets may be smaller (default 1)
  --payout N         Gross win return including stake; must be >1 (default 2)
  --trials N         Positive integer trial count (default 1000)
  --seed N           Integer seed from 0 through 4294967295 (default 1)
  --max-bets N       Positive integer bet cap per trial (default 10000)

  -h, --help         Show help

Use --name value or --name=value. Output is JSON. Percentages use 100 for 100%.
Unfinished trials produce probability: null and empirical probability bounds.
`;

const names = new Map([
  ['bonus', 'bonus'], ['deposit', 'deposit'], ['multiplier', 'multiplier'],
  ['basis', 'basis'], ['contribution', 'contribution'], ['house-edge', 'houseEdge'],
  ['stake', 'stake'], ['payout', 'payout'], ['trials', 'trials'], ['seed', 'seed'], ['max-bets', 'maxBets'],
]);
const simulationOnly = ['stake', 'payout', 'trials', 'seed', 'maxBets'];
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function parse(argv) {
  const options = {};
  const seen = new Set();
  let simulate = false;
  let showHelp = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] === '-h' ? '--help' : argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const equals = token.indexOf('=');
    const name = token.slice(2, equals < 0 ? undefined : equals);
    if (!names.has(name) && name !== 'simulate' && name !== 'help') {
      throw new Error(`unknown option: --${name}`);
    }
    if (seen.has(name)) throw new Error(`duplicate option: --${name}`);
    seen.add(name);
    if (name === 'simulate' || name === 'help') {
      if (equals >= 0) throw new Error(`--${name} does not accept a value`);
      if (name === 'simulate') simulate = true;
      else showHelp = true;
      continue;
    }
    const value = equals < 0 ? argv[++i] : token.slice(equals + 1);
    if (value === undefined || value === '' || value.startsWith('--') || value === '-h') {
      throw new Error(`--${name} requires a value`);
    }
    if (name === 'basis') options.basis = value;
    else {
      if (!decimal.test(value) || !Number.isFinite(Number(value))) {
        throw new Error(`--${name} requires a finite decimal number`);
      }
      options[names.get(name)] = Number(value);
    }
  }
  if (!showHelp && !simulate && simulationOnly.some(key => Object.hasOwn(options, key))) {
    throw new Error('simulation options require --simulate');
  }
  return { options, simulate, showHelp };
}

try {
  const { options, simulate, showHelp } = parse(process.argv.slice(2));
  if (showHelp) process.stdout.write(help);
  else {
    const result = calculateBonus(options);
    if (simulate) result.simulation = simulateRollover(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`Error: ${error.message}\nUse --help for usage.\n`);
  process.exitCode = 1;
}
