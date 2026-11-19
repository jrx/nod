const modifiers = new Set(['alt', 'control', 'ctrl', 'meta', 'cmd', 'command', 'shift']);

export function isEnterKey(key: string | undefined) {
  const value = (key ?? '')
    .split('+')
    .filter((part) => !modifiers.has(part.toLowerCase()))
    .join('+');
  return ['enter', 'return', 'numpadenter', '\r', '\n'].includes(value.toLowerCase());
}
