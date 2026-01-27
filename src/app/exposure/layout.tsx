import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Exposure',
};

export default function ExposureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
