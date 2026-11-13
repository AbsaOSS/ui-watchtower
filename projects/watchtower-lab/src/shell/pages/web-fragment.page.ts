import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA
} from '@angular/core';

@Component({
  selector: 'lab-web-fragment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <section class="lab-page">
      <h1>Web Fragment</h1>
      <p>
        The same embedded application, this time as a Web Fragment: its page is
        drawn inside this one, in a shadow root, while its JavaScript runs in a
        hidden iframe of its own. The gateway in the lab's server routes its
        files. It forwards to this shell over this tab's channel, so its events
        show in the Event Inspector marked ↪ Embedded application.
      </p>
      <web-fragment class="lab-embed" fragment-id="lab-fragment"></web-fragment>
    </section>
  `
})
export class WebFragmentPage {}
