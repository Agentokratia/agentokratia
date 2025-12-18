import type { Metadata } from 'next';
import Script from 'next/script';
import { DM_Sans, Newsreader, Space_Mono } from 'next/font/google';
import { Providers } from '@/components/providers/Providers';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Agentokratia - Agent Marketplace',
  description: 'Discover and use AI agents with pay-per-call pricing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${newsreader.variable} ${spaceMono.variable}`}>
      <head>
        <Script src="/suppress-extension-errors.js" strategy="beforeInteractive" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
