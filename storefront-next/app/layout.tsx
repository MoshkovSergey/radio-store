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

const yandexMetrikaScript = `
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=113655439', 'ym');

ym(113655439, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {/* Yandex.Metrika counter */}
        <script dangerouslySetInnerHTML={{ __html: yandexMetrikaScript }} />
        {/* /Yandex.Metrika counter */}
      </head>
      <body>
        <script src="https://yandex.ru/ads/system/context.js" async></script>
        <script data-page-id="20233889" src="https://yandex.ru/ads/system/ap-loader.js" async></script>

        <noscript>
          <div>
            <img
              src="https://mc.yandex.ru/watch/113655439"
              style={{ position: 'absolute', left: '-9999px' }}
              alt=""
            />
          </div>
        </noscript>

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