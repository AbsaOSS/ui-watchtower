import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal
} from '@angular/core';
import { CpsMenuComponent, CpsTooltipDirective } from 'cps-ui-kit';
import {
  UWT_INSPECTOR_DOCKS,
  UwtInspectorDock
} from '../uwt-inspector.models/uwt-inspector.models';

const DOCK_LABEL: Record<UwtInspectorDock, string> = {
  dialog: 'Dialog',
  window: 'Separate window',
  left: 'Dock left',
  bottom: 'Dock bottom',
  right: 'Dock right'
};

/**
 * Moves the inspector between docks, like Chrome DevTools' dock side: one
 * icon per dock, the current one pressed. cps-ui-kit has no dock icons, so
 * they are drawn here. Without room for a pane, only the dialog and the
 * window are offered. Where the inspector is too narrow for the buttons, one
 * button shows the current dock and opens a menu of them all.
 */
@Component({
  selector: 'uwt-inspector-dock-switcher',
  imports: [CpsMenuComponent, CpsTooltipDirective, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './uwt-inspector-dock-switcher.component.html',
  styleUrl: './uwt-inspector-dock-switcher.component.scss'
})
export class UwtInspectorDockSwitcherComponent {
  readonly dock = input.required<UwtInspectorDock>();
  /** Whether the panes are offered; not on a narrow screen. */
  readonly panes = input(true);
  /** Too narrow for the buttons: a menu instead. */
  readonly compact = input(false);
  readonly dockChange = output<UwtInspectorDock>();

  protected readonly options = computed(() =>
    UWT_INSPECTOR_DOCKS.filter(
      (dock) => this.panes() || dock === 'dialog' || dock === 'window'
    ).map((dock) => ({ dock, label: DOCK_LABEL[dock] }))
  );

  protected readonly open = signal(false);

  protected readonly currentLabel = computed(() => DOCK_LABEL[this.dock()]);

  /** Arrow keys, Home and End move between the menu's items. */
  protected onMenuKey(event: KeyboardEvent): void {
    const items = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
        '[role="menuitemradio"]'
      )
    );
    const at = items.indexOf(
      (event.currentTarget as HTMLElement).ownerDocument
        .activeElement as HTMLElement
    );
    const next: Record<string, number> = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1
    };
    if (event.key in next && items.length) {
      event.preventDefault();
      items[next[event.key]].focus();
    }
  }

  protected choose(dock: UwtInspectorDock): void {
    if (dock !== this.dock()) {
      this.dockChange.emit(dock);
    }
  }
}
