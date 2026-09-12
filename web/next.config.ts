import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["172.20.10.2", "localhost:3000", "172.20.10.2:3000"],
};

export default nextConfig;
