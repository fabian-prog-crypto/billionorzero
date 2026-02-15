import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Metals',
};

export default function MetalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
