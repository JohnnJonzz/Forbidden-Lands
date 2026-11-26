import type { NextConfig } from "next";
import { sourcebookProxyBytes } from "./src/lib/sourcebook-upload-limits";
const nextConfig: NextConfig = {
  experimental: {
    // Next 16 Proxy otherwise truncates its replayed body at 10 MiB.
    // PDF storage independently enforces the advertised file limit (64 MiB
    // by default); this bounded replay buffer includes 1 MiB of headroom.
    proxyClientMaxBodySize: sourcebookProxyBytes(),
  },
};
export default nextConfig;
