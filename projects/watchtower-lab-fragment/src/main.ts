import { bootstrapApplication } from '@angular/platform-browser';
import { FragmentComponent } from './fragment.component';
import { fragmentConfig } from './fragment.config';

/**
 * The lab's fragment: a second app, shown by the shell in a plain iframe and
 * as a Web Fragment. Either way it runs in its own JavaScript realm.
 */
bootstrapApplication(FragmentComponent, fragmentConfig).catch(
  (error: unknown) => console.error(error)
);
