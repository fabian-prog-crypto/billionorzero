/**
 * Performance Metrics - Domain Service
 * Professional investor metrics: CAGR, Sharpe Ratio, Max Drawdown
 */

import { NetWorthSnapshot } from '@/types';
import { differenceInDays } from 'date-fns';

/**
 * Data quality thresholds
 */
export const DATA_QUALITY_THRESHOLDS = {
  MIN_DAYS_FOR_CAGR: 30,           // Minimum days before CAGR is meaningful
  RECOMMENDED_DAYS_FOR_CAGR: 365,  // Recommended days for reliable CAGR
  MIN_DAYS_FOR_VOLATILITY: 30,     // Minimum days before volatility is meaningful
  RECOMMENDED_DAYS_FOR_VOLATILITY: 60, // Recommended days for reliable volatility
  MIN_DAYS_FOR_SHARPE: 60,         // Minimum days before Sharpe is meaningful
};

/**
 * Data quality warnings for metrics
 */
export interface DataQualityWarnings {
  cagrWarning: string | null;      // Warning about CAGR reliability
  volatilityWarning: string | null; // Warning about volatility reliability
  sharpeWarning: string | null;    // Warning about Sharpe reliability
  hasInsufficientData: boolean;    // True if any critical metric lacks data
}

/**
 * Performance metrics result
 */
export interface PerformanceMetrics {
  // Return metrics
  totalReturn: number;           // Total return as percentage
  totalReturnAbsolute: number;   // Total return in USD
  cagr: number;                  // Compound Annual Growth Rate

  // Risk metrics
  maxDrawdown: number;           // Maximum drawdown as percentage
  maxDrawdownAbsolute: number;   // Maximum drawdown in USD
  maxDrawdownDate: string | null; // Date of maximum drawdown
  currentDrawdown: number;       // Current drawdown from peak

  // Risk-adjusted returns
  sharpeRatio: number;           // Sharpe ratio (using risk-free rate)
  volatility: number;            // Annualized volatility (std dev of returns)

  // Period info
  periodDays: number;            // Number of days in period
  dataPoints: number;            // Number of snapshots used

  // Data quality
  dataQuality: DataQualityWarnings; // Warnings about data reliability
  riskFreeRateUsed: number;      // The risk-free rate used for Sharpe calculation
}

/**
 * Default risk-free rate (annualized)
 * Using ~5% which reflects current US Treasury rates
 * Can be overridden via settings
 */
export const DEFAULT_RISK_FREE_RATE = 0.05;

/**
 * Trading days in a year (for annualization)
 */
const TRADING_DAYS_PER_YEAR = 252;

/**
 * Calculate CAGR (Compound Annual Growth Rate)
 * CAGR = (EndValue / StartValue)^(1/years) - 1
 */
export function calculateCAGR(
  startValue: number,
  endValue: number,
  periodDays: number
): number {
  if (startValue <= 0 || periodDays <= 0) return 0;

  const years = periodDays / 365;
  if (years === 0) return 0;

  const cagr = Math.pow(endValue / startValue, 1 / years) - 1;
  return cagr * 100; // Return as percentage
}

/**
 * Calculate maximum drawdown from peak
 * Returns both percentage and absolute value
 */
export function calculateMaxDrawdown(snapshots: NetWorthSnapshot[]): {
  maxDrawdownPercent: number;
  maxDrawdownAbsolute: number;
  maxDrawdownDate: string | null;
  currentDrawdown: number;
  peak: number;
} {
  if (snapshots.length < 2) {
    return {
      maxDrawdownPercent: 0,
      maxDrawdownAbsolute: 0,
      maxDrawdownDate: null,
      currentDrawdown: 0,
      peak: snapshots[0]?.totalValue || 0,
    };
  }

  let peak = snapshots[0].totalValue;
  let maxDrawdownPercent = 0;
  let maxDrawdownAbsolute = 0;
  let maxDrawdownDate: string | null = null;

  for (const snapshot of snapshots) {
    // Update peak if we have a new high
    if (snapshot.totalValue > peak) {
      peak = snapshot.totalValue;
    }

    // Calculate current drawdown from peak
    const drawdownAbsolute = peak - snapshot.totalValue;
    const drawdownPercent = peak > 0 ? (drawdownAbsolute / peak) * 100 : 0;

    // Track maximum drawdown
    if (drawdownPercent > maxDrawdownPercent) {
      maxDrawdownPercent = drawdownPercent;
      maxDrawdownAbsolute = drawdownAbsolute;
      maxDrawdownDate = snapshot.date;
    }
  }

  // Calculate current drawdown
  const lastValue = snapshots[snapshots.length - 1].totalValue;
  const currentDrawdown = peak > 0 ? ((peak - lastValue) / peak) * 100 : 0;

  return {
    maxDrawdownPercent,
    maxDrawdownAbsolute,
    maxDrawdownDate,
    currentDrawdown,
    peak,
  };
}

/**
 * Calculate daily returns from snapshots
 */
export function calculateDailyReturns(snapshots: NetWorthSnapshot[]): number[] {
  if (snapshots.length < 2) return [];

  const returns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prevValue = snapshots[i - 1].totalValue;
    const currValue = snapshots[i].totalValue;

    if (prevValue > 0) {
      const dailyReturn = (currValue - prevValue) / prevValue;
      returns.push(dailyReturn);
    }
  }

  return returns;
}

/**
 * Calculate volatility (annualized standard deviation of returns)
 */
export function calculateVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;

  // Calculate mean return
  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

  // Calculate variance
  const squaredDiffs = dailyReturns.map((r) => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (dailyReturns.length - 1);

  // Standard deviation
  const stdDev = Math.sqrt(variance);

  // Annualize (multiply by sqrt of trading days)
  return stdDev * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100; // Return as percentage
}

/**
 * Calculate Sharpe Ratio
 * Sharpe = (Portfolio Return - Risk Free Rate) / Portfolio Volatility
 *
 * Interpretation:
 * < 1.0: Sub-optimal
 * 1.0 - 2.0: Good
 * 2.0 - 3.0: Very good
 * > 3.0: Excellent
 */
export function calculateSharpeRatio(
  annualizedReturn: number, // As decimal (e.g., 0.10 for 10%)
  annualizedVolatility: number, // As decimal
  riskFreeRate: number = DEFAULT_RISK_FREE_RATE
): number {
  if (annualizedVolatility <= 0) return 0;

  return (annualizedReturn - riskFreeRate) / annualizedVolatility;
}

/**
 * Generate data quality warnings based on available data
 */
function generateDataQualityWarnings(periodDays: number, dataPoints: number): DataQualityWarnings {
  const warnings: DataQualityWarnings = {
    cagrWarning: null,
    volatilityWarning: null,
    sharpeWarning: null,
    hasInsufficientData: false,
  };

  // CAGR warnings
  if (periodDays < DATA_QUALITY_THRESHOLDS.MIN_DAYS_FOR_CAGR) {
    warnings.cagrWarning = `Only ${periodDays} days of data. CAGR requires at least ${DATA_QUALITY_THRESHOLDS.MIN_DAYS_FOR_CAGR} days for meaningful results.`;
    warnings.hasInsufficientData = true;
  } else if (periodDays < DATA_QUALITY_THRESHOLDS.RECOMMENDED_DAYS_FOR_CAGR) {
    warnings.cagrWarning = `Annualized from ${periodDays} days. For reliable CAGR, ${DATA_QUALITY_THRESHOLDS.RECOMMENDED_DAYS_FOR_CAGR}+ days recommended.`;
  }

  // Volatility warnings
  if (dataPoints < DATA_QUALITY_THRESHOLDS.MIN_DAYS_FOR_VOLATILITY) {
    warnings.volatilityWarning = `Only ${dataPoints} data points. Volatility requires at least ${DATA_QUALITY_THRESHOLDS.MIN_DAYS_FOR_VOLATILITY} days for meaningful results.`;
    warnings.hasInsufficientData = true;
  } else if (dataPoints < DATA_QUALITY_THRESHOLDS.RECOMMENDED_DAYS_FOR_VOLATILITY) {
    warnings.volatilityWarning = `Based on ${dataPoints} days. For reliable volatility, ${DATA_QUALITY_THRESHOLDS.RECOMMENDED_DAYS_FOR_VOLATILITY}+ days recommended.`;
  }

  // Sharpe warnings (depends on both CAGR and volatility)
  if (dataPoints < DATA_QUALITY_THRESHOLDS.MIN_DAYS_FOR_SHARPE) {
    warnings.sharpeWarning = `Insufficient data for reliable Sharpe ratio. Need ${DATA_QUALITY_THRESHOLDS.MIN_DAYS_FOR_SHARPE}+ days.`;
    warnings.hasInsufficientData = true;
  }

  return warnings;
}

/**
 * Calculate all performance metrics from snapshots
 */
export function calculatePerformanceMetrics(
  snapshots: NetWorthSnapshot[],
  riskFreeRate: number = DEFAULT_RISK_FREE_RATE
): PerformanceMetrics {
  const emptyDataQuality: DataQualityWarnings = {
    cagrWarning: 'Insufficient data',
    volatilityWarning: 'Insufficient data',
    sharpeWarning: 'Insufficient data',
    hasInsufficientData: true,
  };

  // Need at least 2 snapshots for meaningful metrics
  if (snapshots.length < 2) {
    return {
      totalReturn: 0,
      totalReturnAbsolute: 0,
      cagr: 0,
      maxDrawdown: 0,
      maxDrawdownAbsolute: 0,
      maxDrawdownDate: null,
      currentDrawdown: 0,
      sharpeRatio: 0,
      volatility: 0,
      periodDays: 0,
      dataPoints: snapshots.length,
      dataQuality: emptyDataQuality,
      riskFreeRateUsed: riskFreeRate,
    };
  }

  const startSnapshot = snapshots[0];
  const endSnapshot = snapshots[snapshots.length - 1];

  // Calculate period
  const periodDays = differenceInDays(
    new Date(endSnapshot.date),
    new Date(startSnapshot.date)
  );

  // Generate data quality warnings
  const dataQuality = generateDataQualityWarnings(periodDays, snapshots.length);

  // Total return
  const totalReturnAbsolute = endSnapshot.totalValue - startSnapshot.totalValue;
  const totalReturn = startSnapshot.totalValue > 0
    ? (totalReturnAbsolute / startSnapshot.totalValue) * 100
    : 0;

  // CAGR
  const cagr = calculateCAGR(
    startSnapshot.totalValue,
    endSnapshot.totalValue,
    periodDays
  );

  // Max drawdown
  const {
    maxDrawdownPercent,
    maxDrawdownAbsolute,
    maxDrawdownDate,
    currentDrawdown,
  } = calculateMaxDrawdown(snapshots);

  // Daily returns and volatility
  const dailyReturns = calculateDailyReturns(snapshots);
  const volatility = calculateVolatility(dailyReturns);

  // Annualized return for Sharpe (convert CAGR from percentage to decimal)
  const annualizedReturn = cagr / 100;
  const annualizedVolatility = volatility / 100;
  const sharpeRatio = calculateSharpeRatio(
    annualizedReturn,
    annualizedVolatility,
    riskFreeRate
  );

  return {
    totalReturn,
    totalReturnAbsolute,
    cagr,
    maxDrawdown: maxDrawdownPercent,
    maxDrawdownAbsolute,
    maxDrawdownDate,
    currentDrawdown,
    sharpeRatio,
    volatility,
    periodDays,
    dataPoints: snapshots.length,
    dataQuality,
    riskFreeRateUsed: riskFreeRate,
  };
}

/**
 * Calculate unrealized PnL for a position with cost basis
 */
export function calculateUnrealizedPnL(
  currentValue: number,
  costBasis: number | undefined,
  purchaseDate: string | undefined
): {
  pnl: number;
  pnlPercent: number;
  annualizedReturn: number;
  holdingDays: number;
} {
  if (!costBasis || costBasis === 0) {
    return { pnl: 0, pnlPercent: 0, annualizedReturn: 0, holdingDays: 0 };
  }

  const pnl = currentValue - costBasis;
  const pnlPercent = (pnl / costBasis) * 100;

  // Calculate holding period
  let holdingDays = 0;
  let annualizedReturn = 0;

  if (purchaseDate) {
    holdingDays = differenceInDays(new Date(), new Date(purchaseDate));
    if (holdingDays > 0 && costBasis > 0) {
      annualizedReturn = calculateCAGR(costBasis, currentValue, holdingDays);
    }
  }

  return { pnl, pnlPercent, annualizedReturn, holdingDays };
}

/**
 * Get Sharpe ratio interpretation
 */
export function getSharpeInterpretation(sharpe: number): {
  label: string;
  color: string;
} {
  if (sharpe >= 3) return { label: 'Excellent', color: 'var(--positive)' };
  if (sharpe >= 2) return { label: 'Very Good', color: 'var(--positive)' };
  if (sharpe >= 1) return { label: 'Good', color: 'var(--foreground)' };
  if (sharpe >= 0) return { label: 'Below Average', color: 'var(--foreground-muted)' };
  return { label: 'Poor', color: 'var(--negative)' };
}

/**
 * Get max drawdown interpretation
 */
export function getDrawdownInterpretation(drawdown: number): {
  label: string;
  color: string;
} {
  if (drawdown <= 5) return { label: 'Low Risk', color: 'var(--positive)' };
  if (drawdown <= 10) return { label: 'Moderate', color: 'var(--foreground)' };
  if (drawdown <= 20) return { label: 'Elevated', color: 'var(--foreground-muted)' };
  if (drawdown <= 30) return { label: 'High', color: 'var(--negative)' };
  return { label: 'Severe', color: 'var(--negative)' };
}
