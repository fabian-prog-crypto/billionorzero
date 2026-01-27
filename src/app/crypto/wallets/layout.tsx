import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Wallets',
};

export default function CryptoWalletsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
