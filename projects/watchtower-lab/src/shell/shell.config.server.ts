import { mergeApplicationConfig } from '@angular/core';
import {
  provideServerRendering,
  RenderMode,
  ServerRoute,
  withRoutes
} from '@angular/ssr';
import { labOptions } from '../lab/lab-options';
import { shellConfig } from './shell.config';

/** Every page is rendered on the server, for each request — but one. */
const serverRoutes: ServerRoute[] = [
  // cps-ui-kit's cps-select creates a ResizeObserver in its constructor,
  // which a server doesn't have: "On the wire" renders in the browser.
  { path: 'wire', renderMode: RenderMode.Client },
  // Its effective settings are the browser's, from the query string.
  { path: 'settings', renderMode: RenderMode.Client },
  { path: 'settings/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server }
];

/**
 * The shell on the server, with the default options: a query string's take
 * effect once the browser takes over.
 */
export const serverConfig = mergeApplicationConfig(
  shellConfig(labOptions('')),
  {
    providers: [provideServerRendering(withRoutes(serverRoutes))]
  }
);
