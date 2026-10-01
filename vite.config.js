import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // art/ holds raw AI downloads (written while the server runs) and tools/ has its own node_modules;
    // watching them only causes locked-file crashes on Windows
    watch: { ignored: ["**/art/**", "**/tools/**"] },
  },
});
