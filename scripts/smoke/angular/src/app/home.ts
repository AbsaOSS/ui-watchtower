import { Component, inject } from '@angular/core';
import {
  UwtBITelemetryService,
  UwtLoggerService,
  UwtScenarioTelemetryService
} from '@absaoss-cps/ngx-ui-watchtower';

/** Uses every service while it renders — on the server, when prerendered. */
@Component({
  selector: 'app-home',
  template: '<p id="scenario">scenario {{ status }}</p>'
})
export class Home {
  readonly status: string;

  constructor() {
    const scenarios = inject(UwtScenarioTelemetryService);
    const scenario = scenarios.start({ name: 'render-home' });
    scenario.step('render');
    inject(UwtBITelemetryService).track('home_rendered', { server: true });
    inject(UwtLoggerService).getLogger('smoke').log('Home rendered');
    scenario.complete();
    this.status = scenario.status ?? 'running';

    // @ts-expect-error not a registered scenario: the augmentation applies
    scenarios.findByName('render-hom');
  }
}
