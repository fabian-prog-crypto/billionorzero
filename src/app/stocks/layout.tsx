import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stocks',
};

export default function StocksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
