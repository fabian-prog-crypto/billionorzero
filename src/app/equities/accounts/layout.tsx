import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Brokerage Accounts',
};

export default function BrokerageAccountsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
