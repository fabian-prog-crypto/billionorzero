import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Accounts',
};

export default function CryptoAccountsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
