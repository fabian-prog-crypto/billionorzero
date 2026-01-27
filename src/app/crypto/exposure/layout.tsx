import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Exposure',
};

export default function CryptoExposureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
