import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto',
};

export default function CryptoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
