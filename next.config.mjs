/** @type {import('next').NextConfig} */

const nextConfig = {
  reactCompiler: true, // React compiler optimized

  // ⚡ Headers for FFmpeg WebAssembly
  async headers() {
    return [
      {
        source: "/(.*)", // Sab routes par apply hoga
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },

  // Optional future Next.js options
  poweredByHeader: false, // hide 'X-Powered-By' header
  reactStrictMode: true, // strict mode for debugging
  swcMinify: true, // faster minification
};

export default nextConfig;

// /** @type {import('next').NextConfig} */
// const nextConfig = {
//   /* config options here */
//   reactCompiler: true,
// };

// export default nextConfig;
