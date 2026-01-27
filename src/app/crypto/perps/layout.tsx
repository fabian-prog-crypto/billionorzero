import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Perps',
};

export default function CryptoPerpsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
