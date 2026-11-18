import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UwtInspectorDock } from '../uwt-inspector.models/uwt-inspector.models';
import { UwtInspectorDockSwitcherComponent } from './uwt-inspector-dock-switcher.component';

describe('UwtInspectorDockSwitcherComponent', () => {
  let fixture: ComponentFixture<UwtInspectorDockSwitcherComponent>;
  let chosen: UwtInspectorDock[];
  const buttons = () =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    );

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NoopAnimationsModule] });
    fixture = TestBed.createComponent(UwtInspectorDockSwitcherComponent);
    chosen = [];
    fixture.componentInstance.dockChange.subscribe((d) => chosen.push(d));
    fixture.componentRef.setInput('dock', 'right');
    fixture.detectChanges();
  });

  it('should offer every dock, named, with the current one pressed', () => {
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Dialog',
      'Separate window',
      'Dock left',
      'Dock bottom',
      'Dock right'
    ]);
    expect(
      buttons().map((b) => b.getAttribute('aria-pressed') === 'true')
    ).toEqual([false, false, false, false, true]);
  });

  it('should offer only the dialog and the window without room for a pane', () => {
    fixture.componentRef.setInput('panes', false);
    fixture.detectChanges();

    expect(buttons().map((b) => b.getAttribute('data-dock'))).toEqual([
      'dialog',
      'window'
    ]);
  });

  it('should ask for another dock, and ignore the current one', () => {
    buttons()[4].click();
    buttons()[1].click();

    expect(chosen).toEqual(['window']);
  });

  describe('compact', () => {
    const trigger = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '.uwt-inspector-dock__trigger'
      )!;
    const items = () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
      );
    /** Opens the menu; its animation callbacks run once the app is stable. */
    const open = async () => {
      trigger().click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    beforeEach(() => {
      fixture.componentRef.setInput('compact', true);
      fixture.detectChanges();
    });

    afterEach(() => fixture.destroy());

    it('should show the current dock as one button that opens a menu, not the five', () => {
      expect(buttons()).toEqual([trigger()]);
      expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
      expect(trigger().getAttribute('aria-label')).toBe(
        'Dock position: Dock right'
      );
    });

    it('should list every dock by name in the menu, the current one checked', async () => {
      await open();

      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      expect(items().map((i) => i.textContent?.trim())).toEqual([
        'Dialog',
        'Separate window',
        'Dock left',
        'Dock bottom',
        'Dock right'
      ]);
      expect(items().map((i) => i.getAttribute('aria-checked'))).toEqual([
        'false',
        'false',
        'false',
        'false',
        'true'
      ]);
    });

    it('should offer only the dialog and the window without room for a pane', async () => {
      fixture.componentRef.setInput('panes', false);
      fixture.detectChanges();
      await open();

      expect(items().map((i) => i.getAttribute('data-dock'))).toEqual([
        'dialog',
        'window'
      ]);
    });

    it('should ask for the dock chosen, and close; the current one asks for nothing', async () => {
      await open();
      items()[2].click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(chosen).toEqual(['left']);
      expect(trigger().getAttribute('aria-expanded')).toBe('false');

      await open();
      items()[4].click();
      expect(chosen).toEqual(['left']);
    });

    it('should move between the items with the arrow keys, Home and End', async () => {
      await open();
      const press = (key: string) => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        );
        return document.activeElement;
      };
      items()[4].focus();

      expect(press('ArrowDown')).toBe(items()[0]);
      expect(press('ArrowUp')).toBe(items()[4]);
      expect(press('Home')).toBe(items()[0]);
      expect(press('End')).toBe(items()[4]);
    });
  });
});
