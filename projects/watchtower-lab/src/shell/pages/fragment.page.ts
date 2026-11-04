import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'lab-fragment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Fragment</h1>
      <p>
        A second app, in its own iframe and JavaScript realm, with the
        'broadcast' sink: it hands everything to this shell, which records it
        once. Its events show in the Event Inspector marked ↪ lab-fragment;
        signing in or out there applies here too.
      </p>
      <iframe
        class="lab-fragment"
        src="/fragment-app"
        title="Lab fragment"></iframe>
    </section>
  `,
  styles: `
    .lab-fragment {
      width: 100%;
      height: 24rem;
      border: 0.0625rem dashed var(--cps-color-line-mid);
      border-radius: 0.5rem;
      background-color: #fff;
    }
  `
})
export class FragmentPage {}
