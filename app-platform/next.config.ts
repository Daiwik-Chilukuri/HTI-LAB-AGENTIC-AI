/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required: better-sqlite3 is a native Node module and can't be bundled by webpack
  serverExternalPackages: ['better-sqlite3'],
  
  // Disable image optimization for dev simplicity
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
