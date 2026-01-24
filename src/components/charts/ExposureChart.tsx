'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AssetWithPrice } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { calculateExposureData, SimpleExposureItem } from '@/services';

interface ExposureChartProps {
  assets: AssetWithPrice[];
  size?: number;
}

export default function ExposureChart({ assets, size = 180 }: ExposureChartProps) {
  // Use centralized exposure calculation - single source of truth
  const exposureData = useMemo(() => calculateExposureData(assets), [assets]);

  const { simpleBreakdown } = exposureData;

  if (simpleBreakdown.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[var(--foreground-muted)] text-sm"
        style={{ width: size, height: size }}
      >
        No assets
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={simpleBreakdown}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.35}
            outerRadius={size * 0.45}
            paddingAngle={2}
            dataKey="value"
          >
            {simpleBreakdown.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
                stroke="none"
              />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as SimpleExposureItem;
                return (
                  <div className="card p-2.5 shadow-lg min-w-[140px]">
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {formatCurrency(item.value)} ({item.percentage.toFixed(1)}%)
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {simpleBreakdown.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="font-medium">{item.label}</span>
            <span className="text-[var(--foreground-muted)] ml-auto">
              {item.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
