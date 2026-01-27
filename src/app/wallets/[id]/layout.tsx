import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wallet Details',
};

export default function WalletDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
