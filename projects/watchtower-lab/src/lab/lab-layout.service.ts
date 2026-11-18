import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

/**
 * Whether the lab's fixed header and status bar follow an Event Inspector
 * pane, through the `--uwt-inspector-inset-*` variables it publishes. Off,
 * they show what a pane covers in an app that hasn't opted in.
 */
@Injectable({ providedIn: 'root' })
export class LabLayout {
  readonly insets = signal(true);

  constructor() {
    const root = inject(DOCUMENT).documentElement;
    effect(() => root.classList.toggle('lab-insets', this.insets()));
  }
}
