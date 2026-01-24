'use client';

import { ReactNode, useState, useRef, useEffect } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: number;
}

export default function Tooltip({
  children,
  content,
  position = 'bottom',
  maxWidth = 280
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Adjust position if tooltip would overflow viewport
  useEffect(() => {
    if (isVisible && tooltipRef.current && containerRef.current) {
      const tooltip = tooltipRef.current.getBoundingClientRect();
      const container = containerRef.current.getBoundingClientRect();

      // Check if tooltip goes off screen and adjust
      if (position === 'bottom' && tooltip.bottom > window.innerHeight) {
        setAdjustedPosition('top');
      } else if (position === 'top' && tooltip.top < 0) {
        setAdjustedPosition('bottom');
      } else if (position === 'right' && tooltip.right > window.innerWidth) {
        setAdjustedPosition('left');
      } else if (position === 'left' && tooltip.left < 0) {
        setAdjustedPosition('right');
      } else {
        setAdjustedPosition(position);
      }
    }
  }, [isVisible, position]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`absolute z-[100] ${positionClasses[adjustedPosition]}`}
          style={{ maxWidth, minWidth: 200 }}
        >
          <div className="tooltip-content">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
