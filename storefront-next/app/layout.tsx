import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { AuthProvider } from '@/lib/auth-context';
import { absoluteUrl, siteUrl } from '@/lib/seo';

import './globals.css';
import './blog-styles.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Radio Store — интернет-магазин радиодеталей',
    template: '%s | Radio Store',
  },
  description:
    'Резисторы, конденсаторы, микроконтроллеры, модули ESP32, датчики, инструменты и комплектующие с доставкой.',
  keywords: [
    'радиодетали',
    'магазин радиодеталей',
    'резисторы',
    'конденсаторы',
    'микроконтроллеры',
    'ESP32',
    'ATmega328P',
    'электронные компоненты',
  ],
  alternates: {
    canonical: absoluteUrl('/'),
  },
  openGraph: {
    type: 'website',
    siteName: 'Radio Store',
    locale: 'ru_RU',
    url: absoluteUrl('/'),
    title: 'Radio Store — интернет-магазин радиодеталей',
    description:
      'Резисторы, конденсаторы, микроконтроллеры, модули ESP32, датчики, инструменты и комплектующие с доставкой.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <div className="marketplace">
            <Header />
            <main className="main">{children}</main>
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}