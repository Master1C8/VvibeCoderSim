import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Anonymous Usage Statistics · VvibeCoder Sim',
  description: 'Privacy-friendly aggregate usage statistics for VvibeCoder Sim.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function StatsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
