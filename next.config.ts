import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js blocks cross-origin requests to dev-only assets (_next/*, HMR)
  // by default, so opening the dev server from another device on the same
  // Wi-Fi (e.g. a phone hitting http://192.168.x.x:3000) loads the page's
  // HTML but then hangs forever, since the JS chunks that make the flipbook
  // work get silently rejected with 403. These patterns cover the two most
  // common home-router IP ranges so LAN testing "just works". This setting
  // has no effect in production (`next build`/`next start`) or on Vercel —
  // it only relaxes the local dev server.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Hides the on-screen "N" route indicator that `next dev` overlays in the
  // corner of the screen — purely a dev-time debugging aid, not something
  // that should show up while testing the reader itself.
  devIndicators: false,
  // /embed is meant to be iframed by third-party sites — state that
  // explicitly so no default (or future) framing restriction blocks it.
  async headers() {
    return [
      {
        source: "/embed",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
