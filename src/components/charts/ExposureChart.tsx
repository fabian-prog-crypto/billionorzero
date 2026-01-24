'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AssetWithPrice } from '@/types';
import { formatCurrency } from '@/lib/utils';
import {
  AssetCategory,
  getAssetCategory,
  getCategoryLabel,
  CATEGORY_COLORS,
} from '@/lib/assetCategories';

interface ExposureChartProps {
  assets: AssetWithPrice[];
  size?: number;
}

interface CategoryData {
  category: AssetCategory;
  label: string;
  value: number;
  percentage: number;
  color: string;
}

export default function ExposureChart({ assets, size = 180 }: ExposureChartProps) {
  // Aggregate assets by category
  const categoryTotals: Record<AssetCategory, number> = {
    stablecoins: 0,
    btc: 0,
    eth: 0,
    sol: 0,
    cash: 0,
    stocks: 0,
    other: 0,
  };

  let totalValue = 0;
  assets.forEach((asset) => {
    if (asset.value > 0) {
      const category = getAssetCategory(asset.symbol, asset.type);
      categoryTotals[category] += asset.value;
      totalValue += asset.value;
    }
  });

  // Build chart data, only including categories with value
  const data: CategoryData[] = (Object.keys(categoryTotals) as AssetCategory[])
    .filter((category) => categoryTotals[category] > 0)
    .map((category) => ({
      category,
      label: getCategoryLabel(category),
      value: categoryTotals[category],
      percentage: totalValue > 0 ? (categoryTotals[category] / totalValue) * 100 : 0,
      color: CATEGORY_COLORS[category],
    }))
    .sort((a, b) => b.value - a.value);

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
                fill={entry.color}
                stroke="none"
              />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as CategoryData;
                return (
                  <div className="card p-2 shadow-lg">
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
        {data.map((item) => (
          <div key={item.category} className="flex items-center gap-2 text-sm">
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
