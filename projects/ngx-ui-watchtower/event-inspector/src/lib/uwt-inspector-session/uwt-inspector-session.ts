import {
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  Injectable,
  Signal
} from '@angular/core';
import { UwtInspectorDock } from '../uwt-inspector.models/uwt-inspector.models';
import { UwtInspectorStore } from '../uwt-inspector-store/uwt-inspector-store';

/** One way of showing the inspector: a dialog, a pane or a window. */
export interface UwtInspectorHost {
  /** Where it shows the inspector. */
  readonly dock: UwtInspectorDock;
  /** Moves focus into the inspector. */
  focus(): void;
  /** Whether keyboard focus is inside the inspector. */
  containsFocus(): boolean;
  /** Takes the inspector off the screen; the session carries on. */
  destroy(): void;
}

/** What the inspector's own controls ask for: another dock, or closing. */
export interface UwtInspectorControls {
  setDock(dock: UwtInspectorDock): void;
  close(): void;
  /** Whether the app's window is wide enough for a pane beside it. */
  readonly panesFit: Signal<boolean>;
}

/**
 * One opening of the Event Inspector, from open to close, whichever docks
 * it moves between. Holds the captured history, so moving the inspector
 * keeps its events, filters and pause.
 */
@Injectable({ providedIn: 'root' })
export class UwtInspectorSession {
  private readonly parent = inject(EnvironmentInjector);
  private injector?: EnvironmentInjector;

  /** Set by `UwtEventInspectorService`, which shows the inspector. */
  controls?: UwtInspectorControls;

  /** The captured history, started on first use. */
  get store(): UwtInspectorStore {
    this.injector ??= createEnvironmentInjector(
      [UwtInspectorStore],
      this.parent
    );
    return this.injector.get(UwtInspectorStore);
  }

  /** Discards the history and stops capturing. */
  end(): void {
    this.injector?.destroy();
    this.injector = undefined;
  }
}
