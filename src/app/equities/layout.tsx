import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Equities',
};

export default function EquitiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
