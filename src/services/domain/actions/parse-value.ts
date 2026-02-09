/**
 * Parse an abbreviated number string into a number.
 * Handles: "52k" -> 52000, "1.5m" -> 1500000, "$3,200" -> 3200, plain "4811" -> 4811.
 */
export function parseAbbreviatedNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, '').trim().toLowerCase();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === 'k') return num * 1_000;
  if (suffix === 'm') return num * 1_000_000;
  if (suffix === 'b') return num * 1_000_000_000;
  return num;
}
