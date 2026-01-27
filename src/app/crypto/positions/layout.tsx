import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Positions',
};

export default function CryptoPositionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
