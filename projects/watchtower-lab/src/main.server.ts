import {
  BootstrapContext,
  bootstrapApplication
} from '@angular/platform-browser';
import { ShellComponent } from './shell/shell.component';
import { serverConfig } from './shell/shell.config.server';

/** The shell, rendered on the server for each request. */
const bootstrap = (context: BootstrapContext) =>
  bootstrapApplication(ShellComponent, serverConfig, context);

export default bootstrap;
