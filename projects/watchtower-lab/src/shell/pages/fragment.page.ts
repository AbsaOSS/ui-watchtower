import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'lab-fragment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Iframe</h1>
      <p>
        The embedded application in a plain iframe: its own page and its own
        JavaScript realm, with the 'broadcast' sink. It hands everything to this
        shell, which records it once. Its events show in the Event Inspector
        marked ↪ Embedded application; signing in or out there applies here too.
      </p>
      <!-- In the browser only, once the shell runs: the frame reads this
        tab's channel from it as it starts. -->
      @defer {
        <iframe
          class="lab-embed lab-fragment"
          src="/fragment-frame/"
          title="Embedded application"></iframe>
      }
    </section>
  `
})
export class FragmentPage {}
