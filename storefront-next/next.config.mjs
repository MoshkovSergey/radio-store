/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Скрываем индикатор разработки (кружок с «N») в dev-режиме.
  // В production он и так не показывается.
  devIndicators: 'hidden',

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