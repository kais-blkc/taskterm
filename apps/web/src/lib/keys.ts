/** Пользователь сейчас вводит текст — горячие клавиши не перехватываем */
export function isTyping(target: EventTarget | null = document.activeElement): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';
