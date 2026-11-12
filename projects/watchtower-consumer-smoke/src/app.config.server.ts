import { mergeApplicationConfig } from '@angular/core';
import {
  provideServerRendering,
  RenderMode,
  ServerRoute,
  withRoutes
} from '@angular/ssr';
import { appConfig } from './app.config';

/** Rendered on the server at build time: the build fails if that throws. */
const serverRoutes: ServerRoute[] = [
  { path: '**', renderMode: RenderMode.Prerender }
];

export const serverConfig = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering(withRoutes(serverRoutes))]
});
