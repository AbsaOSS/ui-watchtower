import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import { UwtTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent } from 'cps-ui-kit';
import { LabResultsComponent } from '../../lab/lab-results.component';

/** RUM user ids must be UUIDs. */
const ANNA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const BEN = '9b2d1c6e-7a53-4d0e-8f3b-2c1a5e6d7f80';

@Component({
  selector: 'lab-identity-page',
  imports: [CpsButtonComponent, LabResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page lab-page--results">
      <h1>Identity</h1>
      <p>
        The status bar shows the session and user. Signing out while signed in
        starts a new session; signing out while signed out changes nothing. On
        the wire, each event's metadata carries <code>signedIn</code>.
      </p>
      <div class="lab-page__cards">
        <div class="lab-card">
          <h2>Signing in and out</h2>
          <div class="lab-actions">
            <cps-button label="Sign in as Anna" (clicked)="setUser(anna)" />
            <cps-button
              label="Sign in as Ben"
              type="outlined"
              (clicked)="setUser(ben)" />
            <cps-button
              label="Sign out (undefined)"
              type="outlined"
              (clicked)="setUser(undefined)" />
            <cps-button
              label="Sign out ('')"
              type="outlined"
              (clicked)="setUser('')" />
          </div>
        </div>
      </div>
      <lab-results>
        <pre
          class="lab-readout"
          tabindex="0"
          role="region"
          aria-label="Last result"
          >{{ readout() || 'No change yet.' }}</pre>
      </lab-results>
    </section>
  `
})
export class IdentityPage {
  protected readonly anna = ANNA;
  protected readonly ben = BEN;
  protected readonly readout = signal('');

  private readonly sink = inject(UwtTelemetrySink);

  protected setUser(userId: string | undefined): void {
    this.sink.setUserId(userId);
    this.readout.set(
      `setUserId(${userId === undefined ? 'undefined' : `'${userId}'`}): ` +
        (userId
          ? `events from now on carry ${userId === ANNA ? 'Anna' : 'Ben'}'s id.`
          : 'signed out — the status bar shows any new session.')
    );
  }
}
