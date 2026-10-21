/**
 * Static export, because the app is hosted on GitHub Pages.
 *
 * Two consequences worth knowing:
 *   - There is no server, so every route must be known at build time. Rooms live in a query
 *     string (`/build/?room=xyz`), not a path segment, since room ids are invented by visitors.
 *   - A GitHub Pages *project* site is served from `/<repo>/`, so `basePath` has to match or
 *     every asset 404s. It is injected at build time by the deploy workflow and left empty for
 *     local dev and for a user/custom-domain site served from the root.
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  reactStrictMode: true,

  // Emit `build/index.html` rather than `build.html`, which is what Pages expects for `/build/`.
  trailingSlash: true,

  basePath,
  assetPrefix: basePath || undefined,

  // No server means no on-demand image optimisation.
  images: { unoptimized: true },

  // brick-core is published as raw TypeScript source inside the workspace, so Next has to
  // compile it rather than treat it as a prebuilt dependency.
  transpilePackages: ["@kumitate/brick-core"],

  // CLAUDE.md at the repo root is the single source of agent instructions; Next's generated
  // apps/web/AGENTS.md would be a second, silently-regenerated one that drifts from it.
  agentRules: false,
};

export default nextConfig;
