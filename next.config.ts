import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', '@huggingface/transformers'],
};

export default nextConfig;
