import { bootstrapApplication } from '@angular/platform-browser';
import { initializeWebFragments } from 'web-fragments';
import { labOptions } from './lab/lab-options';
import { ShellComponent } from './shell/shell.component';
import { shellConfig } from './shell/shell.config';

// Registers <web-fragment>, before the shell renders one.
initializeWebFragments();

bootstrapApplication(
  ShellComponent,
  shellConfig(labOptions(location.search))
).catch((error: unknown) => console.error(error));
