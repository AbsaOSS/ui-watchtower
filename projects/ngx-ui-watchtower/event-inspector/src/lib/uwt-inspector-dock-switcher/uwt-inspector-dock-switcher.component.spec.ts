import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should ask for another dock, and ignore the current one', () => {
    buttons()[4].click();
    buttons()[1].click();

    expect(chosen).toEqual(['window']);
  });
});
