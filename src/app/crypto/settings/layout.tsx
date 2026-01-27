import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Settings',
};

export default function CryptoSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
