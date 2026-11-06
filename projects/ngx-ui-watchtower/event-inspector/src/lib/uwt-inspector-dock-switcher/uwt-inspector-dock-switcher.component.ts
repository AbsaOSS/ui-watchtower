import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output
} from '@angular/core';
import { CpsTooltipDirective } from 'cps-ui-kit';
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
 * window are offered.
 */
@Component({
  selector: 'uwt-inspector-dock-switcher',
  imports: [CpsTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './uwt-inspector-dock-switcher.component.html',
  styleUrl: './uwt-inspector-dock-switcher.component.scss'
})
export class UwtInspectorDockSwitcherComponent {
  readonly dock = input.required<UwtInspectorDock>();
  /** Whether the panes are offered; not on a narrow screen. */
  readonly panes = input(true);
  readonly dockChange = output<UwtInspectorDock>();

  protected readonly options = computed(() =>
    UWT_INSPECTOR_DOCKS.filter(
      (dock) => this.panes() || dock === 'dialog' || dock === 'window'
    ).map((dock) => ({ dock, label: DOCK_LABEL[dock] }))
  );

  protected choose(dock: UwtInspectorDock): void {
    if (dock !== this.dock()) {
      this.dockChange.emit(dock);
    }
  }
}
