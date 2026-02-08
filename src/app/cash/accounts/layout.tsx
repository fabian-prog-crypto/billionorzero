import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cash Accounts',
};

export default function CashAccountsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
