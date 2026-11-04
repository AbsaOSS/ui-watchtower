import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { CpsDialogService } from 'cps-ui-kit';
import {
  UWT_EVENT_INSPECTOR_CONFIG,
  UwtEventInspectorConfig
} from '../uwt-inspector.models/uwt-inspector.models';
import { UwtInspectorDialogComponent } from '../uwt-inspector-dialog/uwt-inspector-dialog.component';
import { UwtEventInspectorService } from './uwt-event-inspector.service';

/** Stands in for CpsDialogService, recording what was opened. */
class FakeDialogs {
  readonly opened: { component: unknown; config: Record<string, unknown> }[] =
    [];

  readonly destroyed = new Subject<void>();
  containsFocus = false;
  readonly instance = {
    containsFocus: () => this.containsFocus,
    focusSearch: jest.fn()
  };

  readonly close = jest.fn(() => this.destroyed.next());

  open(component: unknown, config: Record<string, unknown>) {
    this.opened.push({ component, config });
    return {
      componentInstance: this.instance,
      onDestroy: this.destroyed.asObservable(),
      close: this.close
    };
  }
}

const SHORTCUT = {
  code: 'Digit8',
  ctrlKey: true,
  altKey: true,
  shiftKey: true
};

type KeyInit = ConstructorParameters<typeof KeyboardEvent>[1];

function press(init: KeyInit = SHORTCUT): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    ...init,
    bubbles: true,
    cancelable: true
  });
  document.body.dispatchEvent(event);
  return event;
}

describe('UwtEventInspectorService', () => {
  let dialogs: FakeDialogs;

  function create(
    config: Partial<UwtEventInspectorConfig> = {},
    platform = 'browser'
  ): UwtEventInspectorService {
    TestBed.resetTestingModule();
    dialogs = new FakeDialogs();
    TestBed.configureTestingModule({
      providers: [
        { provide: CpsDialogService, useValue: dialogs },
        { provide: PLATFORM_ID, useValue: platform },
        { provide: UWT_EVENT_INSPECTOR_CONFIG, useValue: config }
      ]
    });
    return TestBed.inject(UwtEventInspectorService);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
  });

  it('should open the popup, non-modal and named, on the default shortcut', () => {
    create().install();

    const event = press();

    expect(dialogs.opened).toHaveLength(1);
    expect(dialogs.opened[0].component).toBe(UwtInspectorDialogComponent);
    expect(dialogs.opened[0].config).toMatchObject({
      modal: false,
      ariaLabel: 'Event Inspector',
      closeOnEscape: true
    });
    expect(event.defaultPrevented).toBe(true);
    expect(TestBed.inject(UwtEventInspectorService).isOpen()).toBe(true);
  });

  it('should also open on the macOS shortcut', () => {
    create().install();
    press({ code: 'Digit8', metaKey: true, altKey: true, shiftKey: true });
    expect(dialogs.opened).toHaveLength(1);
  });

  it('should ignore ordinary typing and near misses', () => {
    create().install();

    press({ code: 'Digit8' });
    press({ code: 'Digit8', ctrlKey: true, shiftKey: true });
    press({ code: 'KeyD', ctrlKey: true, altKey: true, shiftKey: true });

    expect(dialogs.opened).toHaveLength(0);
  });

  it('should bring focus back to an open popup, and close it from inside', () => {
    create().install();
    press();

    dialogs.containsFocus = false;
    press();
    expect(dialogs.instance.focusSearch).toHaveBeenCalledTimes(1);
    expect(dialogs.close).not.toHaveBeenCalled();

    dialogs.containsFocus = true;
    press();
    expect(dialogs.close).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(UwtEventInspectorService).isOpen()).toBe(false);
  });

  it('should open fresh after the previous popup was destroyed', () => {
    create().install();
    press();
    dialogs.destroyed.next();

    press();
    expect(dialogs.opened).toHaveLength(2);
  });

  it('should use custom shortcuts instead of the defaults', () => {
    create({
      shortcuts: [{ code: 'KeyD', ctrl: true, alt: true, shift: true }]
    }).install();

    press();
    expect(dialogs.opened).toHaveLength(0);
    press({ code: 'KeyD', ctrlKey: true, altKey: true, shiftKey: true });
    expect(dialogs.opened).toHaveLength(1);
  });

  it('should not listen with no shortcuts, but still open on request', () => {
    const service = create({ shortcuts: [] });
    service.install();

    press();
    expect(dialogs.opened).toHaveLength(0);

    service.open();
    expect(dialogs.opened).toHaveLength(1);
  });

  it.each([
    ['disabled', { enabled: false }],
    ['disabled by a function', { enabled: () => false }]
  ])('should do nothing when %s', (_label, config) => {
    const service = create(config);
    service.install();

    press();
    service.open();
    expect(dialogs.opened).toHaveLength(0);
  });

  it('should treat a throwing enabled() as disabled', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = create({
      enabled: () => {
        throw new Error('auth not ready');
      }
    });
    service.install();
    service.open();
    expect(dialogs.opened).toHaveLength(0);
  });

  it('should not listen during a server-side render', () => {
    create({}, 'server').install();
    press();
    expect(dialogs.opened).toHaveLength(0);
  });

  it('should stop listening when the application is destroyed', () => {
    create().install();
    TestBed.resetTestingModule();

    press();
    expect(dialogs.opened).toHaveLength(0);
  });
});
