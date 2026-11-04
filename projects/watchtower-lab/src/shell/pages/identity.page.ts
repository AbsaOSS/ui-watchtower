import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UwtTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent } from 'cps-ui-kit';

/** RUM user ids must be UUIDs. */
const ANNA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const BEN = '9b2d1c6e-7a53-4d0e-8f3b-2c1a5e6d7f80';

@Component({
  selector: 'lab-identity-page',
  imports: [CpsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Identity</h1>
      <p>
        The status bar shows the session and user. Signing out while signed in
        starts a new session; signing out while signed out changes nothing. On
        the wire, each event's metadata carries <code>signedIn</code>.
      </p>
      <div class="lab-card">
        <div class="lab-actions">
          <cps-button
            label="Sign in as Anna"
            (clicked)="sink.setUserId(anna)" />
          <cps-button
            label="Sign in as Ben"
            type="outlined"
            (clicked)="sink.setUserId(ben)" />
          <cps-button
            label="Sign out (undefined)"
            type="outlined"
            (clicked)="sink.setUserId(undefined)" />
          <cps-button
            label="Sign out ('')"
            type="outlined"
            (clicked)="sink.setUserId('')" />
        </div>
      </div>
    </section>
  `
})
export class IdentityPage {
  protected readonly sink = inject(UwtTelemetrySink);
  protected readonly anna = ANNA;
  protected readonly ben = BEN;
}
