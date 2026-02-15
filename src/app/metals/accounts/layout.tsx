import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Metal Accounts',
};

export default function MetalsAccountsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
