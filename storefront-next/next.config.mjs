/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Полностью отключаем dev-индикаторы (кружок с «N» и статус сборки).
  // В твоей версии Next схема devIndicators принимает объект или false,
  // но НЕ строку 'hidden' — строка давала warning и игнорировалась.
  devIndicators: false,

  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8080',
        pathname: '/media/**',
      },
      {
        protocol: 'https',
        hostname: 'radio-store.example',
        pathname: '/media/**',
      },
    ],
  },
};

export default nextConfig;