import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { labBackend } from './lab-backend';
import { labFragments } from './lab-fragments';

/**
 * The Watchtower Lab's server: the mock backend, the fragment and the
 * server-rendered shell, all on one origin. `ng serve` runs it in
 * development; the suite runs the built `server.mjs`.
 */
const app = express();
const browserDistFolder = join(import.meta.dirname, '../browser');
const angularApp = new AngularNodeAppEngine();

app.use(labBackend);
app.use(labFragments);
// The app's own catch-all redirect drops the query, and with it the startup
// options (`?destination=`, `?config=`, …): the start page keeps them.
app.get('/', (req, res) => {
  const query = req.originalUrl.indexOf('?');
  res.redirect(
    302,
    `/scenarios${query < 0 ? '' : req.originalUrl.slice(query)}`
  );
});
app.use(
  express.static(browserDistFolder, {
    index: false,
    redirect: false
  })
);
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next()
    )
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = process.env.PORT || 4280;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`[watchtower-lab] on http://localhost:${port}`);
  });
}

/** Used by `ng serve` and the build. */
export const reqHandler = createNodeRequestHandler(app);
