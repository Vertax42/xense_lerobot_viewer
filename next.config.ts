import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ["three"],
  // Avoid the 200-800ms cold-start cost of barrel-file imports for the
  // wide-surface packages we still ship.
  experimental: {
    optimizePackageImports: ["react-icons", "recharts"],
  },
  generateBuildId: () => packageJson.version,
};

export default nextConfig;
