import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The Angular UI Watchtower mark, drawn inline: a library can't rely on the
 * app serving an asset. Decorative — the title beside it names the window.
 */
@Component({
  selector: 'uwt-inspector-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  templateUrl: './uwt-inspector-logo.component.html',
  styleUrl: './uwt-inspector-logo.component.scss'
})
export class UwtInspectorLogoComponent {}
