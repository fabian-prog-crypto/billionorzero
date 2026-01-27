import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Other',
};

export default function OtherLayout({ children }: { children: React.ReactNode }) {
  return children;
}
