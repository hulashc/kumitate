/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // CLAUDE.md at the repo root is the single source of agent instructions; Next's generated
  // apps/web/AGENTS.md would be a second, silently-regenerated one that drifts from it.
  agentRules: false,
  // brick-core is published as raw TypeScript source inside the workspace, so Next has to
  // compile it rather than treat it as a prebuilt dependency.
  transpilePackages: ["@kumitate/brick-core"],
};

export default nextConfig;
