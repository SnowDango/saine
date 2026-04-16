import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: [
      { find: /^~(.+)/, replacement: resolve(__dirname, "./$1") },
    ],
  },
})
