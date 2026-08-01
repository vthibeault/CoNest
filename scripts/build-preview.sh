#!/usr/bin/env bash
#
# Builds the static UI preview that GitHub Pages serves.
#
#   ./scripts/build-preview.sh [output-dir]      # defaults to ./preview-dist
#   PREVIEW_BASE_PATH=/CoNest ./scripts/build-preview.sh
#
# Why this exists rather than just running `next build`:
#
# CoNest is server-rendered. It has middleware, server actions, cookie-backed
# sessions and a route handler, and Next's static exporter refuses all of them.
# So the real app cannot be exported, and never will be — that is a property of
# the app, not a gap to close.
#
# What can be exported is the preview page in preview/app: the real calendar
# components against fixed sample data, with no database. This script assembles
# a throwaway Next project containing only that page plus the shared code it
# imports, and exports it.
#
# The assembled project is built from an ALLOWLIST, not by deleting the dynamic
# routes from a copy of the app. That direction matters: adding a new
# server-rendered route to the real app must not silently break this build, and
# with an allowlist it simply is not included.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT/preview-dist}"
BASE_PATH="${PREVIEW_BASE_PATH:-}"

if [ ! -d "$ROOT/node_modules" ]; then
  echo "error: run npm install first" >&2
  exit 1
fi

# Assembled inside the repo rather than in /tmp, and deliberately without a
# node_modules symlink: Turbopack rejects symlinks that leave the project root,
# but a nested directory resolves the repo's own node_modules by walking up.
WORK="$ROOT/.preview-build"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
rm -rf "$WORK"
mkdir -p "$WORK"

echo "==> assembling preview project"

# Shared code the preview imports. lib/supabase and lib/family come along
# because they sit in these trees, but nothing the preview renders imports
# them, so they are never bundled.
mkdir -p "$WORK/src/app"
cp -r "$ROOT/src/components" "$WORK/src/components"
cp -r "$ROOT/src/lib" "$WORK/src/lib"

# The preview's own layout and page become the root of this throwaway app.
cp -r "$ROOT/preview/app/." "$WORK/src/app/"
cp "$ROOT/src/app/globals.css" "$WORK/src/app/globals.css"

# Just the icons, not all of public/ — the service worker has no business in a
# static preview that cannot serve the app it would cache.
mkdir -p "$WORK/public"
cp -r "$ROOT/public/icons" "$WORK/public/icons"

cp "$ROOT/package.json" "$ROOT/postcss.config.mjs" "$ROOT/tsconfig.json" "$WORK/"

cat > "$WORK/next.config.ts" <<CONFIG
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Project Pages are served from a subdirectory, so assets need the prefix.
  basePath: "${BASE_PATH}",
  images: { unoptimized: true },
  typedRoutes: false,

  // The whole of src/components comes along so the bundler can resolve
  // whatever the preview imports, which drags in files referencing server
  // actions that this assembled project does not contain. Turbopack only
  // bundles what is reachable and compiles cleanly; it is the type checker
  // that walks everything. Types and lint are enforced against the real
  // project by the main CI job, so re-running them here would only re-check
  // code this build cannot execute.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
CONFIG

echo "==> building static export${BASE_PATH:+ (base path ${BASE_PATH})}"
(cd "$WORK" && npx --no-install next build)

if [ ! -d "$WORK/out" ]; then
  echo "error: next build produced no out/ directory" >&2
  exit 1
fi

# Pages would otherwise run Jekyll, which strips directories beginning with an
# underscore — including _next, which is everything.
touch "$WORK/out/.nojekyll"

rm -rf "$OUT_DIR"
mkdir -p "$(dirname "$OUT_DIR")"
mv "$WORK/out" "$OUT_DIR"

echo
echo "Preview built into $OUT_DIR"
