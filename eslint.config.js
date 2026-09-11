const js = require("@eslint/js");
const globals = require("globals");

// Flat config. The whole codebase is CommonJS run on Node (src/, bin/, scripts/, test/);
// a handful of files run in the renderer (browser) instead. The recommended ruleset plus
// three project rules: no loose equality, no var, and prefer const where a binding is
// never reassigned.
module.exports = [
  {
    // Parked experiment code and throwaway agent worktrees are not part of the product.
    ignores: ["node_modules/**", "assets/**", "data/**", "docs/**", "experiments/**", ".claude/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node }
    },
    rules: {
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "warn"
    }
  },
  {
    // Renderer-side files run in the browser. preload.js also keeps Node's require, so
    // these keep the Node globals from the block above and add the browser ones.
    files: [
      "src/renderer.js",
      "src/sprite-player.js",
      "src/preload.js",
      "scripts/darshan-preview/*.js"
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Injected by manifest.js and sprite-player.js on window, and by preload.js.
        KRISHNA_ANIM_STYLES: "readonly",
        KRISHNA_ANIM_DEFAULT_STYLE: "readonly",
        KRISHNA_ANIM: "readonly",
        KrishnaSprite: "readonly",
        krishna: "readonly",
        // Injected into the darshan-preview page before bridge.js runs.
        previewTimings: "readonly",
        previewReflections: "readonly"
      }
    }
  }
];
