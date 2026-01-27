import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Wallet Details',
};

export default function CryptoWalletDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
