/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Скрываем dev-индикатор (кружок «N»). false — валидно во всех Next 15.x.
  devIndicators: false,

  images: {
    remotePatterns: [
      // Прод-медиа приходят абсолютными с radioamp.ru (NEXT_PUBLIC_API_URL),
      // поэтому домен должен быть разрешён для next/image на всех 5 доменах-зеркалах.
      { protocol: 'https', hostname: 'radioamp.ru', pathname: '/media/**' },
      // Локальная разработка / сборка на сервере до наличия TLS.
      { protocol: 'http', hostname: 'localhost', port: '8080', pathname: '/media/**' },
      { protocol: 'http', hostname: '127.0.0.1', port: '8080', pathname: '/media/**' },
    ],
  },
};

export default nextConfig;