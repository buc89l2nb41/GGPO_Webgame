import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

const API_PREFIX = '/api/hitbox-editor';

function getDataFilePath(root: string): string {
  return path.resolve(root, 'src/game/data/characters/hitboxSavedData.json');
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function handleSave(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const raw = await readRequestBody(req);
    const parsed = JSON.parse(raw) as { version?: number };
    if (parsed.version !== 1) {
      sendJson(res, 400, { ok: false, message: 'Unsupported hitbox data version.' });
      return;
    }

    const filePath = getDataFilePath(root);
    const formatted = `${JSON.stringify(parsed, null, 2)}\n`;
    await fs.writeFile(filePath, formatted, 'utf8');
    sendJson(res, 200, { ok: true, message: 'Saved to hitboxSavedData.json', path: filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save failed';
    sendJson(res, 500, { ok: false, message });
  }
}

async function handleLoad(root: string, res: ServerResponse): Promise<void> {
  try {
    const filePath = getDataFilePath(root);
    const raw = await fs.readFile(filePath, 'utf8');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Load failed';
    sendJson(res, 500, { ok: false, message });
  }
}

export function hitboxEditorApiPlugin(): Plugin {
  return {
    name: 'hitbox-editor-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(API_PREFIX)) {
          next();
          return;
        }

        const root = server.config.root;

        if (req.method === 'POST' && req.url === `${API_PREFIX}/save`) {
          await handleSave(root, req, res);
          return;
        }

        if (req.method === 'GET' && req.url === `${API_PREFIX}/load`) {
          await handleLoad(root, res);
          return;
        }

        sendJson(res, 404, { ok: false, message: 'Not found' });
      });
    },
  };
}
