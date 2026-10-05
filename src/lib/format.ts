/** Formats a USD amount; small amounts get three decimals so cents fractions stay visible. */
export function formatUsd(amount: number | null): string {
  if (amount === null) return "unknown";
  return `$${amount.toFixed(amount < 1 ? 3 : 2)}`;
}
