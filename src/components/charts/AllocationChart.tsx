'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AssetWithPrice } from '@/types';
import { formatCurrency, formatPercent } from '@/lib/utils';

interface AllocationChartProps {
  assets: AssetWithPrice[];
  size?: number;
}

const COLORS = [
  '#8B7355',
  '#A68B6A',
  '#C4A77D',
  '#D4C4A8',
  '#4A7C59',
  '#6B9B7A',
  '#8DB99A',
  '#B5D4C0',
  '#C75050',
  '#D47A7A',
];

export default function AllocationChart({ assets, size = 180 }: AllocationChartProps) {
  const data = assets
    .filter((a) => a.value > 0)
    .slice(0, 10)
    .map((asset) => ({
      name: asset.symbol.toUpperCase(),
      value: asset.value,
      percentage: asset.allocation,
    }));

  // Add "other" category if there are more assets
  const totalShown = data.reduce((sum, d) => sum + d.value, 0);
  const totalAll = assets.reduce((sum, a) => sum + a.value, 0);

  if (totalAll > totalShown) {
    data.push({
      name: 'other',
      value: totalAll - totalShown,
      percentage: ((totalAll - totalShown) / totalAll) * 100,
    });
  }

  if (data.length === 0) {
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
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.35}
            outerRadius={size * 0.45}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
                stroke="none"
              />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload;
                return (
                  <div className="card p-2 shadow-lg">
                    <p className="font-medium text-sm">{item.name}</p>
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
      <div className="flex-1 space-y-1.5 max-h-[180px] overflow-y-auto">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2 text-sm">
            <div
              className="w-2.5 h-2.5  flex-shrink-0"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="font-medium">{item.name}</span>
            <span className="text-[var(--foreground-muted)] ml-auto">
              {item.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
