// `npm run lab`: the Watchtower Lab in development. The fragment is rebuilt on
// every change, and `ng serve` runs the shell with server/server.ts — the
// mock backend, the fragment's gateway and server-side rendering — on
// http://localhost:4280. The fragment's pages answer 503 until its first
// build is done.
import { spawn } from 'node:child_process';

const ng = (...args) =>
  spawn('npx', ['ng', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

const children = [
  ng('build', 'watchtower-lab-fragment', '--watch'),
  ng('serve', 'watchtower-lab')
];

const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exitCode ||= code ?? 0;
  });
}
