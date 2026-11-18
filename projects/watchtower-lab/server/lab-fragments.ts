// The lab's fragment, served two ways from its one build
// (`ng build watchtower-lab-fragment`):
//
//   /web-fragment, /_fragment/lab-fragment/…   the Web Fragments gateway
//   /fragment-frame/                           its page, for a plain iframe
import { Router } from 'express';
import { promised } from './promised';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { FragmentGateway } from 'web-fragments/gateway';
import { getNodeMiddleware } from 'web-fragments/gateway/node';

// Relative to where the lab runs from — the repository's root — both under
// `ng serve` and as the built server.
const FRAGMENT_DIR = join(
  process.cwd(),
  'dist/watchtower-lab-fragment/browser'
);
const FRAGMENT_INDEX = join(FRAGMENT_DIR, 'index.html');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

/**
 * The fragment's endpoint, in-process: a file of its build, or its
 * index.html for any other path — the page the gateway hands the
 * `<web-fragment>` element.
 */
const fragmentEndpoint: typeof fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const path = url.pathname.replace(/^\/_fragment\/lab-fragment\//, '/');
  const file = join(FRAGMENT_DIR, normalize(path));
  const found =
    !!extname(file) && file.startsWith(FRAGMENT_DIR) && existsSync(file);
  const served = found ? file : FRAGMENT_INDEX;
  if (!existsSync(served)) {
    return new Response('Build the fragment: npm run lab:build', {
      status: 503
    });
  }
  return new Response(await readFile(served), {
    headers: {
      'content-type':
        CONTENT_TYPES[extname(served)] ?? 'application/octet-stream'
    }
  });
};

const gateway = new FragmentGateway();
gateway.registerFragment({
  fragmentId: 'lab-fragment',
  // Loaded by the <web-fragment> element once the shell runs, rather than
  // pierced into the shell's server-rendered page.
  piercing: false,
  routePatterns: ['/web-fragment/:_*', '/_fragment/lab-fragment/:_*'],
  endpoint: fragmentEndpoint
});

export const labFragments = Router();

const gatewayMiddleware = getNodeMiddleware(gateway);
labFragments.use((req, res, next) => {
  gatewayMiddleware(req, res, next).catch(next);
});

labFragments.get(
  ['/fragment-frame', '/fragment-frame/'],
  promised(async (_req, res) => {
    if (!existsSync(FRAGMENT_INDEX)) {
      res.status(503).send('Build the fragment: npm run lab:build');
      return;
    }
    res.type('html').send(await readFile(FRAGMENT_INDEX));
  })
);
