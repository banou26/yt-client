import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite-plus'

import { AGENT_GLOBAL } from './src/engine/agent-protocol'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// one classic script for the engine page's addScriptTag; the app embeds it through src/engine/agent-source.ts
export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: true,
    lib: {
      entry: fromRoot('./src/engine/botguard-agent.ts'),
      formats: ['iife'],
      name: AGENT_GLOBAL,
      fileName: () => 'botguard-agent.js',
    },
    outDir: 'build-agent',
    target: 'esnext',
  },
})
