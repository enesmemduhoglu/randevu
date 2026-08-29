import type { NextConfig } from "next";

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// `next dev` sirasinda Cloudflare binding'lerini (Hyperdrive vb.) erisilebilir
// kilar. Boylece yerel gelistirme ile Workers arasindaki fark kuculur.
initOpenNextCloudflareForDev();
