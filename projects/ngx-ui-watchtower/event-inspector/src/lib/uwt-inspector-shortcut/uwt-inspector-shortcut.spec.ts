import {
  UWT_DEFAULT_INSPECTOR_SHORTCUTS,
  uwtMatchesShortcut
} from './uwt-inspector-shortcut';

type Mods = Partial<
  Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat'>
>;

function key(
  code: string,
  mods: Mods,
  keyChar = 'I',
  altGraph = false,
  target: EventTarget | null = null
) {
  const event = new KeyboardEvent('keydown', { code, key: keyChar, ...mods });
  Object.defineProperty(event, 'getModifierState', {
    value: (k: string) => k === 'AltGraph' && altGraph
  });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

const [DEFAULT] = UWT_DEFAULT_INSPECTOR_SHORTCUTS;
const shift = { shiftKey: true };
const CUSTOM = { code: 'Digit8', ctrl: true, alt: true, shift: true };
const customMods = { ctrlKey: true, altKey: true, shiftKey: true };

describe('uwtMatchesShortcut', () => {
  it('should match Shift+I pressed right after Shift+E', () => {
    expect(uwtMatchesShortcut(key('KeyI', shift), DEFAULT, 'KeyE')).toBe(true);
  });

  it.each([
    ['nothing before', undefined],
    ['another key before', 'KeyX'],
    ['Shift pressed again in between', 'ShiftLeft']
  ])('should not match Shift+I with %s', (_label, previous) => {
    expect(uwtMatchesShortcut(key('KeyI', shift), DEFAULT, previous)).toBe(
      false
    );
  });

  it.each([
    ['Shift missing', {}],
    ['an extra modifier', { ...shift, ctrlKey: true }]
  ])('should not match with %s', (_label, mods) => {
    expect(uwtMatchesShortcut(key('KeyI', mods), DEFAULT, 'KeyE')).toBe(false);
  });

  it.each([
    ['an input', 'input'],
    ['a text area', 'textarea']
  ])('should not match while typing in %s', (_label, tag) => {
    const field = document.createElement(tag);
    expect(
      uwtMatchesShortcut(key('KeyI', shift, 'I', false, field), DEFAULT, 'KeyE')
    ).toBe(false);
  });

  it('should match a shortcut with Ctrl in a text field, where it types nothing', () => {
    const field = document.createElement('input');
    expect(
      uwtMatchesShortcut(key('Digit8', customMods, '*', false, field), CUSTOM)
    ).toBe(true);
  });

  it('should match a key that types nothing in a text field', () => {
    const field = document.createElement('input');
    expect(
      uwtMatchesShortcut(key('F9', {}, 'F9', false, field), { code: 'F9' })
    ).toBe(true);
  });

  it('should match the physical key, whatever character it produces', () => {
    // On macOS, ⇧⌥8 produces "°" — only the physical key is reliable.
    const mac = { code: 'Digit8', shift: true, alt: true, meta: true };
    const mods = { shiftKey: true, altKey: true, metaKey: true };
    expect(uwtMatchesShortcut(key('Digit8', mods, '°'), mac)).toBe(true);
    expect(uwtMatchesShortcut(key('Numpad8', mods, '°'), mac)).toBe(false);
  });

  it('should ignore a held-down repeat', () => {
    expect(
      uwtMatchesShortcut(
        key('KeyI', { ...shift, repeat: true }),
        DEFAULT,
        'KeyE'
      )
    ).toBe(false);
  });

  it('should not fire while AltGr is producing a character', () => {
    // AltGr reports as Ctrl+Alt on many European Windows layouts.
    expect(
      uwtMatchesShortcut(key('Digit8', customMods, '8', true), CUSTOM)
    ).toBe(false);
  });
});
