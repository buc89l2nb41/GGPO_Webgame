import {
  applySavedHitboxData,
  type SavedHitboxFile,
} from './hitboxOverrideStore';
import {
  buildSavedHitboxFile,
} from './hitboxOverrides';
import savedData from '../data/characters/hitboxSavedData.json';

let initialized = false;

export function initHitboxSavedData(): void {
  if (initialized) return;
  initialized = true;
  applySavedHitboxData(savedData as SavedHitboxFile);
}

export async function saveHitboxDataToProject(): Promise<{ ok: boolean; message: string }> {
  const payload = buildSavedHitboxFile();

  try {
    const response = await fetch('/api/hitbox-editor/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json() as { ok?: boolean; message?: string };
    if (!response.ok || !result.ok) {
      return {
        ok: false,
        message: result.message ?? `Save failed (${response.status})`,
      };
    }

    return {
      ok: true,
      message: result.message ?? 'Saved to hitboxSavedData.json',
    };
  } catch {
    return {
      ok: false,
      message: 'Dev server API unavailable. Use Download JSON instead.',
    };
  }
}

export function downloadHitboxDataFile(): void {
  const payload = buildSavedHitboxFile();
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'hitboxSavedData.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function reloadHitboxDataFromServer(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch('/api/hitbox-editor/load');
    if (!response.ok) {
      return { ok: false, message: `Load failed (${response.status})` };
    }

    const data = await response.json() as SavedHitboxFile;
    applySavedHitboxData(data);
    return { ok: true, message: 'Reloaded from hitboxSavedData.json' };
  } catch {
    return { ok: false, message: 'Could not reload from dev server.' };
  }
}
