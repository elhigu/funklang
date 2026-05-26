// Demoscene-flavoured random instrument name generator. Picks a
// `prefix + base + suffix` combo from a hand-curated table — leans on
// the cracker-intro / chiptune naming aesthetic ("Acid", "Bass++",
// "ZAP!", "Dr.Kick"). Returns deterministic output when called with
// a seeded `random` function — that's how the unit test pins it.

const PREFIXES = [
  '', '', '', '',                 // bias toward "no prefix"
  'Acid', 'Atari', 'Amiga', 'Mega', 'Hyper', 'Cyber', 'Turbo',
  'Neon', 'Plasma', 'Vector', 'Cracktro', 'Demo', 'Tracker',
  'Future', 'Retro', 'Lo-Fi', 'Hi-NRG', 'Pixel', 'Glitch',
  'Dr.', 'Mr.', 'Sgt.', 'Captain', 'DJ',
];

const BASES = [
  'Kick', 'Snare', 'Hat', 'Clap', 'Cymbal', 'Tom', 'Rim',
  'Bass', 'Lead', 'Pad', 'Pluck', 'Arp', 'Stab', 'Bleep',
  'Saw', 'Sine', 'Square', 'Pulse', 'Noise', 'Drone',
  'Zap', 'Boom', 'Smash', 'Crunch', 'Buzz', 'Hum',
  'Phaser', 'Chorus', 'Flanger', 'Reverb',
  'Brass', 'String', 'Choir', 'Vox',
];

const SUFFIXES = [
  '', '', '', '',                 // bias toward "no suffix"
  '!', '!!', '++', '2k',
  ' II', ' III', ' XL', ' MK2',
  '.wav', '.exe', '.lzh', '.dms',
  '/SCN', '/AMI', '/PC',
];

/** Default RNG — `Math.random` is fine for live use; tests inject a seed. */
function defaultRandom(): number { return Math.random(); }

export function generateInstrumentName(random: () => number = defaultRandom): string {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)]!;
  return `${pick(PREFIXES)}${pick(BASES)}${pick(SUFFIXES)}`.trim();
}

/**
 * Seed-friendly LCG so tests can pin the output. Same constants as
 * Numerical Recipes' "quick & dirty" LCG; we only need stable bits, not
 * cryptographic strength.
 */
export function makeSeededRandom(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}
