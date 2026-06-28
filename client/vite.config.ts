import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { hitboxEditorApiPlugin } from './plugins/hitboxEditorApi';

const gameInput = resolve(__dirname, 'index.html');
const editorInput = resolve(__dirname, 'editor.html');

function getBuildInputs(buildTarget: string): Record<string, string> {
  if (buildTarget === 'game') {
    return { main: gameInput };
  }
  if (buildTarget === 'editor') {
    return { editor: editorInput };
  }
  return { main: gameInput, editor: editorInput };
}

function resolveBuildTarget(command: string, mode: string): string {
  if (mode === 'all' || mode === 'editor' || mode === 'game') {
    return mode;
  }
  return command === 'build' ? 'game' : 'all';
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const buildTarget = resolveBuildTarget(command, mode);

  return {
    plugins: [
      react(),
      command === 'serve' ? hitboxEditorApiPlugin() : null,
    ].filter(Boolean),
    server: {
      host: true,
    },
    build: {
      rollupOptions: {
        input: getBuildInputs(buildTarget),
      },
    },
  };
});
