import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  UwtBITelemetryService,
  UwtLoggerService,
  UwtScenarioTelemetryService
} from '@absaoss-cps/ngx-ui-watchtower';
import { UwtEventInspectorService } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';

/** Uses the library the way an app would, through its published API. */
@Component({
  selector: 'smoke-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>ngx-ui-watchtower consumer smoke</h1>
    <button type="button" (click)="track()">Track</button>
    <button type="button" (click)="inspector.open()">Event Inspector</button>
  `
})
export class AppComponent {
  protected readonly inspector = inject(UwtEventInspectorService);

  private readonly bi = inject(UwtBITelemetryService);
  private readonly logger = inject(UwtLoggerService).getLogger('smoke');

  constructor() {
    const scenario = inject(UwtScenarioTelemetryService).start({
      name: 'smoke-render'
    });
    scenario.step('render');
    scenario.complete();
    this.logger.log('Rendered');
  }

  protected track(): void {
    this.bi.track('smoke_clicked');
  }
}
