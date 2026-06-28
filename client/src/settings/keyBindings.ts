import {
  KeyBindings,
  PLAYER1_BINDINGS,
  PLAYER2_BINDINGS,
} from '../game/systems/InputSystem';

export type BindingAction = keyof KeyBindings;

export const BINDING_ACTIONS: BindingAction[] = [
  'up',
  'down',
  'left',
  'right',
  'lightPunch',
  'heavyPunch',
  'lightKick',
  'heavyKick',
];

export const ACTION_LABELS: Record<BindingAction, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  lightPunch: 'Light Punch',
  heavyPunch: 'Heavy Punch',
  lightKick: 'Light Kick',
  heavyKick: 'Heavy Kick',
};

export interface StoredKeyBindings {
  player1: KeyBindings;
  player2: KeyBindings;
}

const STORAGE_KEY = 'ggpo-key-bindings';

const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  Numpad0: 'Num 0',
  Numpad1: 'Num 1',
  Numpad2: 'Num 2',
  Numpad3: 'Num 3',
  Numpad4: 'Num 4',
  Numpad5: 'Num 5',
  Numpad6: 'Num 6',
  Numpad7: 'Num 7',
  Numpad8: 'Num 8',
  Numpad9: 'Num 9',
};

function cloneBindings(bindings: KeyBindings): KeyBindings {
  return {
    up: [...bindings.up],
    down: [...bindings.down],
    left: [...bindings.left],
    right: [...bindings.right],
    lightPunch: [...bindings.lightPunch],
    heavyPunch: [...bindings.heavyPunch],
    lightKick: [...bindings.lightKick],
    heavyKick: [...bindings.heavyKick],
  };
}

export function getDefaultKeyBindings(): StoredKeyBindings {
  return {
    player1: cloneBindings(PLAYER1_BINDINGS),
    player2: cloneBindings(PLAYER2_BINDINGS),
  };
}

function isValidKeyBindings(value: unknown): value is KeyBindings {
  if (!value || typeof value !== 'object') return false;

  return BINDING_ACTIONS.every((action) => {
    const keys = (value as KeyBindings)[action];
    return Array.isArray(keys) && keys.every((key) => typeof key === 'string' && key.length > 0);
  });
}

export function loadKeyBindings(): StoredKeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultKeyBindings();

    const parsed = JSON.parse(raw) as Partial<StoredKeyBindings>;
    if (!isValidKeyBindings(parsed.player1) || !isValidKeyBindings(parsed.player2)) {
      return getDefaultKeyBindings();
    }

    return {
      player1: cloneBindings(parsed.player1),
      player2: cloneBindings(parsed.player2),
    };
  } catch {
    return getDefaultKeyBindings();
  }
}

export function saveKeyBindings(bindings: StoredKeyBindings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

export function formatKeyCode(code: string): string {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export function assignBindingKey(
  bindings: KeyBindings,
  action: BindingAction,
  code: string
): KeyBindings {
  const next = cloneBindings(bindings);

  for (const key of BINDING_ACTIONS) {
    next[key] = next[key].filter((existing) => existing !== code);
  }

  next[action] = [code];
  return next;
}

export function resetPlayerBindings(player: 1 | 2): StoredKeyBindings {
  const current = loadKeyBindings();
  const defaults = getDefaultKeyBindings();

  if (player === 1) {
    current.player1 = cloneBindings(defaults.player1);
  } else {
    current.player2 = cloneBindings(defaults.player2);
  }

  saveKeyBindings(current);
  return current;
}

export function resetAllBindings(): StoredKeyBindings {
  const defaults = getDefaultKeyBindings();
  saveKeyBindings(defaults);
  return defaults;
}

export function isRemappableKey(code: string): boolean {
  return !['Escape', 'F5'].includes(code);
}
