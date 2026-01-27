import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cash',
};

export default function CashLayout({ children }: { children: React.ReactNode }) {
  return children;
}
