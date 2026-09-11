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
      sourceType: "commonjs"
    },
    rules: {
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "warn"
    }
  },
  {
    // Everything that runs on Node: the main process, the CLI, the scripts, the tests.
    // The renderer files are excluded on purpose: they run sandboxed with nodeIntegration
    // off, so a stray `require` or `process` there must be a lint error, not a pass.
    files: ["src/**/*.js", "bin/**/*.js", "scripts/**/*.js", "test/**/*.js", "eslint.config.js"],
    ignores: ["src/renderer.js", "src/sprite-player.js", "scripts/darshan-preview/*.js"],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    // The preload runs in the renderer with Node's require available: both sets.
    files: ["src/preload.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    // Renderer-side files run in the browser only. sprite-player.js carries a UMD shim
    // that checks for `module` before touching it, hence that one Node name.
    files: [
      "src/renderer.js",
      "src/sprite-player.js",
      "scripts/darshan-preview/*.js"
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        module: "readonly",
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
