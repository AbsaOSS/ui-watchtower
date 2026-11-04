import { bootstrapApplication } from '@angular/platform-browser';

/**
 * One build, two apps. At `/fragment-app` — loaded by the shell in an iframe —
 * this page is the fragment: zoneless, forwarding over the broadcast
 * channel. Anywhere else it is the shell, which loads zone.js first. So the
 * lab runs the library both with a zone and without one.
 */
async function start(): Promise<void> {
  if (location.pathname.startsWith('/fragment-app')) {
    const { FragmentComponent } = await import('./fragment/fragment.component');
    const { fragmentConfig } = await import('./fragment/fragment.config');
    await bootstrapApplication(FragmentComponent, fragmentConfig);
    return;
  }
  await import('zone.js');
  const { ShellComponent } = await import('./shell/shell.component');
  const { shellConfig } = await import('./shell/shell.config');
  await bootstrapApplication(ShellComponent, shellConfig);
}

start().catch((error: unknown) => console.error(error));
