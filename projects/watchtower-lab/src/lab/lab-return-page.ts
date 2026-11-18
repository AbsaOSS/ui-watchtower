import { DOCUMENT, inject, Injectable, signal } from '@angular/core';

/** A lab page, as the nav lists it. */
export interface LabPageLink {
  path: string;
  label: string;
}

const KEY = 'watchtower-lab.return-page';
const START: LabPageLink = { path: 'scenarios', label: 'Scenarios' };

/**
 * The last lab page shown before Settings, which takes the whole page:
 * where closing it leads. Kept for the tab, so it outlasts the reload that
 * applies the settings; Scenarios, the start page, until one is shown.
 */
@Injectable({ providedIn: 'root' })
export class LabReturnPage {
  private readonly storage = (() => {
    try {
      return inject(DOCUMENT).defaultView?.sessionStorage;
    } catch {
      // Storage blocked: remembered for this load only.
      return undefined;
    }
  })();

  readonly page = signal<LabPageLink>(this.read());

  set(page: LabPageLink): void {
    this.page.set(page);
    try {
      this.storage?.setItem(KEY, JSON.stringify(page));
    } catch {
      // Storage blocked or full: remembered for this load only.
    }
  }

  private read(): LabPageLink {
    try {
      const stored: unknown = JSON.parse(this.storage?.getItem(KEY) ?? 'null');
      return isPage(stored) ? stored : START;
    } catch {
      return START;
    }
  }
}

function isPage(value: unknown): value is LabPageLink {
  return (
    !!value &&
    typeof (value as LabPageLink).path === 'string' &&
    typeof (value as LabPageLink).label === 'string'
  );
}
