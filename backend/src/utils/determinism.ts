export function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => (value = (value * 16807) % 2147483647) / 2147483647;
}

export function getSeed(reqSeed?: string, fallback = 42) {
  const num = Number(reqSeed);
  if (Number.isFinite(num) && num >= 0) return Math.floor(num);
  return fallback;
}

export function parseFailurePattern(pattern?: string) {
  if (!pattern) return [];
  return pattern.split(",").map((item) => item.trim().toUpperCase());
}
