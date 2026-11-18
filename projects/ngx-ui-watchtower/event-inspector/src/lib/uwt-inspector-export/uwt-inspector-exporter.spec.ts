import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { UWT_DEFAULT_EVENT_NAMESPACE } from '@absaoss-cps/ngx-ui-watchtower';
import { CPS_LIVE_ANNOUNCER_SERVICE, CpsNotificationService } from 'cps-ui-kit';
import { UwtInspectorStore } from '../uwt-inspector-store/uwt-inspector-store';
import { UwtInspectorExporter } from './uwt-inspector-exporter';

/** The exporter on its own, in an app that declares no identity or sink. */
describe('UwtInspectorExporter', () => {
  let error: jest.Mock;

  function setUp(document?: Document): UwtInspectorExporter {
    error = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        UwtInspectorStore,
        UwtInspectorExporter,
        {
          provide: CPS_LIVE_ANNOUNCER_SERVICE,
          useValue: { announce: jest.fn(), clear: jest.fn() }
        },
        { provide: CpsNotificationService, useValue: { error } },
        ...(document ? [{ provide: DOCUMENT, useValue: document }] : [])
      ]
    });
    return TestBed.inject(UwtInspectorExporter);
  }

  function clipboard(writeText: jest.Mock): void {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });
  }

  afterEach(() => jest.restoreAllMocks());

  it('should export an app without an identity with empty fields, and name its file "app"', () => {
    const exporter = setUp();

    expect(JSON.parse(exporter.json('all')).app).toEqual({
      application: '',
      environment: '',
      version: '',
      eventNamespace: UWT_DEFAULT_EVENT_NAMESPACE
    });

    let filename = '';
    URL.createObjectURL = jest.fn(() => 'blob:export');
    URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        filename = this.download;
      });
    exporter.download('all');

    expect(filename).toMatch(/^ngx-ui-watchtower-events-app-all-/);
  });

  it("should say why, when the clipboard refuses, and report it wasn't copied", async () => {
    clipboard(
      jest.fn().mockRejectedValue(new Error('Write permission denied'))
    );
    const exporter = setUp();

    await expect(exporter.copy('all')).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith(
      "Couldn't copy to the clipboard",
      'Write permission denied'
    );
  });

  it('should say why when the failure is not an Error, as text', async () => {
    clipboard(jest.fn().mockRejectedValue('blocked'));
    const exporter = setUp();

    await expect(exporter.copy('all')).resolves.toBe(false);

    expect(error).toHaveBeenCalledWith(
      "Couldn't copy to the clipboard",
      'blocked'
    );
  });

  it("should copy with the app's window, and record no user agent, in a document without one", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    const windowless = document.implementation.createHTMLDocument('');
    const exporter = setUp(windowless);

    await expect(exporter.copy('all')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeText.mock.calls[0][0]).userAgent).toBe('');
  });
});
