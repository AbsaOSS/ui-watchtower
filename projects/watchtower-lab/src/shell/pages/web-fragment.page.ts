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
        The embedded application as a Web Fragment. Unlike in an iframe, its
        page is part of this page's DOM: it is drawn inside this one, in a
        shadow root, as ordinary content of the page, not as a framed document
        of its own. Its JavaScript still runs in a hidden iframe, for a clean
        context. The gateway in the lab's server routes its files. It forwards
        to this shell over this tab's channel, so its events show in the Event
        Inspector marked ↪ Embedded application.
      </p>
      <web-fragment class="lab-embed" fragment-id="lab-fragment"></web-fragment>
    </section>
  `
})
export class WebFragmentPage {}
