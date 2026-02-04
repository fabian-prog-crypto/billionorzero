'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { NetWorthSnapshot } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface NetWorthChartProps {
  snapshots: NetWorthSnapshot[];
  height?: number;
  minimal?: boolean;
}

export default function NetWorthChart({
  snapshots,
  height = 200,
  minimal = false,
}: NetWorthChartProps) {
  const data = useMemo(() => {
    return snapshots.map((s) => ({
      date: s.date,
      value: s.totalValue,
      crypto: s.cryptoValue,
      stock: s.stockValue,
      manual: s.manualValue,
    }));
  }, [snapshots]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[var(--foreground-muted)] text-sm"
        style={{ height }}
      >
        No historical data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: minimal ? -10 : 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {!minimal && (
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--foreground-muted)' }}
            tickFormatter={(value) => format(new Date(value), 'd/M')}
          />
        )}
        {!minimal && (
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--foreground-muted)' }}
            tickFormatter={(value) => formatCurrency(value)}
            width={70}
          />
        )}
        {!minimal && (
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="tooltip-content">
                    <p className="text-xs text-[var(--foreground-muted)] mb-1">
                      {format(new Date(data.date), 'MMM d, yyyy')}
                    </p>
                    <p className="font-semibold">
                      {formatCurrency(data.value)}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--accent-primary)"
          strokeWidth={2}
          fill="url(#colorValue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
