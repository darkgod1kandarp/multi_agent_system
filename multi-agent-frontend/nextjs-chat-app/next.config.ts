import { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
      },
    ],
  },
  env: {
    CUSTOM_API_URL: process.env.CUSTOM_API_URL, // Example of using environment variables
  },
};

export default nextConfig;