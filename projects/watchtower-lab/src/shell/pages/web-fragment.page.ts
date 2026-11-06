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
        The same fragment as a Web Fragment: its page drawn in this one, in a
        shadow root, while its JavaScript runs in a hidden iframe of its own.
        The gateway in the lab's server routes its files. It forwards to this
        shell over this tab's channel, so its events show in the Event Inspector
        marked ↪ lab-fragment.
      </p>
      <web-fragment fragment-id="lab-fragment"></web-fragment>
    </section>
  `,
  styles: `
    web-fragment {
      display: block;
      border: 0.0625rem dashed var(--cps-color-line-mid);
      border-radius: 0.5rem;
      background-color: #fff;
    }
  `
})
export class WebFragmentPage {}
