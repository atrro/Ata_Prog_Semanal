import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "true";
const config: NextConfig = {
  output: staticExport ? "export" : "standalone",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  trailingSlash: staticExport,
  images: { unoptimized: staticExport },
  poweredByHeader: false,
  ...(!staticExport && { async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
    ] }];
  } })
};
export default config;