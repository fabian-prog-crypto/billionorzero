// DeBank API cost constants
export const DEBANK_UNITS_PER_WALLET = 18;
export const DEBANK_COST_PER_UNIT = 0.0002; // $0.0002 per unit ($200 / 1M units)

export function calculateSyncCost(walletCount: number) {
  const estimatedUnits = walletCount * DEBANK_UNITS_PER_WALLET;
  const estimatedCostPerSync = estimatedUnits * DEBANK_COST_PER_UNIT;
  const estimatedMonthlyCost = estimatedCostPerSync * 30; // Once per day

  return {
    units: estimatedUnits,
    costPerSync: estimatedCostPerSync,
    monthlyCost: estimatedMonthlyCost,
  };
}
