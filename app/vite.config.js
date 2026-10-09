import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
// GitHub Pages serves the repository root, so the build writes index.html and assets/ there,
// next to the manifest and icons that already live at the root.
const site = resolve(here, "..");

// Writes sw.js with every built file precached, and removes stale hashed bundles from assets/.
function serviceWorker() {
  return {
    name: "service-worker",
    apply: "build",
    writeBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => f !== "index.html");
      const assetsDir = resolve(site, "assets");
      if (existsSync(assetsDir))
        for (const f of readdirSync(assetsDir)) if (!files.includes("assets/" + f)) rmSync(resolve(assetsDir, f));
      const h = createHash("sha1");
      for (const f of Object.keys(bundle).sort()) h.update(f);
      h.update(readFileSync(resolve(site, "index.html")));
      const sw = readFileSync(resolve(here, "sw.template.js"), "utf8")
        .replace("__VERSION__", h.digest("hex").slice(0, 10))
        .replace("__ASSETS__", JSON.stringify(files.map((f) => "./" + f)));
      writeFileSync(resolve(site, "sw.js"), sw);
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react(), serviceWorker()],
  build: { outDir: site, emptyOutDir: false },
});
