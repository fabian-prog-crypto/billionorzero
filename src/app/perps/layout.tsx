import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Perps',
};

export default function PerpsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
