'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';

export interface DonutChartBreakdownItem {
  label: string;
  value: number;
}

export interface DonutChartItem {
  label: string;
  value: number;
  color: string;
  breakdown?: DonutChartBreakdownItem[]; // Individual positions within this category
}

interface DonutChartProps {
  title: string;
  data: DonutChartItem[];
  size?: number;
  maxItems?: number;
  hideValues?: boolean;
}

export default function DonutChart({
  title,
  data,
  size = 120,
  maxItems = 5,
  hideValues = false,
}: DonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Filter out zero values and sort by value descending
  const sortedData = useMemo(() => {
    return [...data]
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data]);

  // Calculate total
  const total = useMemo(() => {
    return sortedData.reduce((sum, item) => sum + item.value, 0);
  }, [sortedData]);

  // Get display items (limit to maxItems, group rest into "Other")
  const displayItems = useMemo(() => {
    if (sortedData.length <= maxItems) return sortedData;

    const topItems = sortedData.slice(0, maxItems - 1);
    const otherItems = sortedData.slice(maxItems - 1);
    const otherValue = otherItems.reduce((sum, item) => sum + item.value, 0);

    return [
      ...topItems,
      { label: 'Other', value: otherValue, color: '#6B7280' },
    ];
  }, [sortedData, maxItems]);

  // Calculate remaining items count
  const remainingCount = sortedData.length > maxItems ? sortedData.length - maxItems + 1 : 0;

  // Calculate SVG path segments with hover data
  const segments = useMemo(() => {
    if (total === 0) return [];

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 4;
    const innerRadius = radius * 0.6;

    let currentAngle = -90; // Start from top
    const result: { path: string; color: string; index: number; item: DonutChartItem; percentage: number }[] = [];

    displayItems.forEach((item, index) => {
      const percentage = (item.value / total) * 100;
      const angle = (percentage / 100) * 360;

      if (angle === 0) return;

      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;

      // Convert angles to radians
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      // Calculate arc points
      const x1 = centerX + radius * Math.cos(startRad);
      const y1 = centerY + radius * Math.sin(startRad);
      const x2 = centerX + radius * Math.cos(endRad);
      const y2 = centerY + radius * Math.sin(endRad);
      const x3 = centerX + innerRadius * Math.cos(endRad);
      const y3 = centerY + innerRadius * Math.sin(endRad);
      const x4 = centerX + innerRadius * Math.cos(startRad);
      const y4 = centerY + innerRadius * Math.sin(startRad);

      const largeArcFlag = angle > 180 ? 1 : 0;

      const path = `
        M ${x1} ${y1}
        A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
        L ${x3} ${y3}
        A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}
        Z
      `;

      result.push({ path, color: item.color, index, item, percentage });
      currentAngle = endAngle;
    });

    return result;
  }, [displayItems, total, size]);

  // Get hovered item data
  const hoveredItem = hoveredIndex !== null ? displayItems[hoveredIndex] : null;
  const hoveredPercentage = hoveredItem && total > 0 ? (hoveredItem.value / total) * 100 : 0;

  if (sortedData.length === 0) {
    return (
      <div>
        <h4 className="text-[15px] font-medium mb-3">{title}</h4>
        <div className="flex items-center gap-5">
          <div
            className="rounded-full bg-[var(--background-secondary)] flex items-center justify-center"
            style={{ width: size, height: size }}
          >
            <span className="text-[11px] text-[var(--foreground-muted)]">No data</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-[15px] font-medium mb-3">{title}</h4>
      <div className="flex items-start gap-5 relative">
        {/* Donut Chart SVG with center tooltip */}
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size}>
            {segments.map((segment) => (
              <path
                key={segment.index}
                d={segment.path}
                fill={segment.color}
                className="transition-opacity duration-100 cursor-pointer"
                style={{
                  opacity: hoveredIndex === null || hoveredIndex === segment.index ? 1 : 0.3,
                }}
                onMouseEnter={() => setHoveredIndex(segment.index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            ))}
          </svg>

          {/* Hover tooltip with breakdown */}
          {hoveredItem && (
            <div
              className="absolute z-50 backdrop-blur-md bg-white/70 px-2.5 py-1.5 pointer-events-none text-[10px]"
              style={{
                left: size + 10,
                top: '50%',
                transform: 'translateY(-50%)',
                minWidth: 120,
                maxWidth: 160,
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-medium text-black/90">{hoveredItem.label}</span>
                <span className="text-black/50">
                  {hideValues ? '••' : `${hoveredPercentage.toFixed(0)}%`}
                </span>
              </div>
              {hoveredItem.breakdown && hoveredItem.breakdown.length > 0 ? (
                <div className="space-y-px">
                  {hoveredItem.breakdown.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="flex justify-between gap-2 text-[9px]">
                      <span className="truncate text-black/40">{item.label}</span>
                      <span className="flex-shrink-0 text-black/60">{hideValues ? '••••' : formatCurrency(item.value)}</span>
                    </div>
                  ))}
                  {hoveredItem.breakdown.length > 5 && (
                    <div className="text-black/30 text-[8px] mt-0.5">
                      +{hoveredItem.breakdown.length - 5} more
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-black/50">
                  {hideValues ? '••••' : formatCurrency(hoveredItem.value)}
                </div>
              )}
            </div>
          )}
        </div>


        {/* Legend */}
        <div className="flex-1 space-y-1.5 min-w-0">
          {displayItems.map((item, index) => {
            const percentage = total > 0 ? (item.value / total) * 100 : 0;
            const isHovered = hoveredIndex === index;
            return (
              <div
                key={index}
                className={`flex items-center justify-between gap-2 transition-opacity duration-100 cursor-pointer ${
                  hoveredIndex !== null && !isHovered ? 'opacity-30' : 'opacity-100'
                }`}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[12px] truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[12px] font-medium">
                    {hideValues ? '••••' : formatCurrency(item.value)}
                  </span>
                  <span className="text-[11px] text-[var(--foreground-muted)] w-8 text-right">
                    {hideValues ? '••' : `${percentage.toFixed(0)}%`}
                  </span>
                </div>
              </div>
            );
          })}
          {remainingCount > 0 && (
            <div className="text-[11px] text-[var(--foreground-muted)]">
              +{remainingCount} more
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
