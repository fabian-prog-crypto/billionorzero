import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Performance',
};

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
