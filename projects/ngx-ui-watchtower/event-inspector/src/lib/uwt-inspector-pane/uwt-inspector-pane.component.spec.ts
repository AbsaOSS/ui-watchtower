import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UWT_TELEMETRY_IDENTITY } from '@absaoss-cps/ngx-ui-watchtower';
import { CPS_LIVE_ANNOUNCER_SERVICE } from 'cps-ui-kit';
import { UwtInspectorPaneSide } from '../uwt-inspector.models/uwt-inspector.models';
import { UWT_INSPECTOR_PREFERENCES_KEY } from '../uwt-inspector-preferences/uwt-inspector-preferences';
import { UwtInspectorSession } from '../uwt-inspector-session/uwt-inspector-session';
import { UwtInspectorPaneComponent } from './uwt-inspector-pane.component';

// jsdom's viewport is 1024×768, and 1rem is 16px.
describe('UwtInspectorPaneComponent', () => {
  let fixture: ComponentFixture<UwtInspectorPaneComponent>;

  const host = () => fixture.nativeElement as HTMLElement;
  const handle = () =>
    host().querySelector('.uwt-inspector-pane__handle') as HTMLElement;
  const stored = () =>
    JSON.parse(localStorage.getItem(UWT_INSPECTOR_PREFERENCES_KEY) ?? '{}');

  function open(side: UwtInspectorPaneSide): void {
    fixture = TestBed.createComponent(UwtInspectorPaneComponent);
    fixture.componentRef.setInput('side', side);
    fixture.detectChanges();
  }

  function key(key: string): void {
    handle().dispatchEvent(new KeyboardEvent('keydown', { key }));
    fixture.detectChanges();
  }

  function pointer(type: string, clientX: number, clientY = 0): void {
    handle().dispatchEvent(
      new MouseEvent(type, { button: 0, clientX, clientY, bubbles: true })
    );
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UwtInspectorPaneComponent, NoopAnimationsModule],
      providers: [
        {
          provide: UWT_TELEMETRY_IDENTITY,
          useValue: { application: 'app', environment: 'test', version: '1' }
        },
        {
          provide: CPS_LIVE_ANNOUNCER_SERVICE,
          useValue: { announce: jest.fn(), clear: jest.fn() }
        }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.inject(UwtInspectorSession).end();
    localStorage.removeItem(UWT_INSPECTOR_PREFERENCES_KEY);
    document.body.removeAttribute('style');
  });

  it('should open at 36rem, at most half the width, and push the app aside', () => {
    open('right');

    expect(host().getAttribute('role')).toBe('region');
    expect(host().classList).toContain('uwt-inspector-pane--right');
    expect(host().style.width).toBe('512px');
    expect(document.body.style.paddingRight).toBe('512px');
    expect(host().querySelector('uwt-inspector')).not.toBeNull();
  });

  it('should publish its size for the app, and take it back when it closes', () => {
    const inset = (side: string) =>
      document.documentElement.style.getPropertyValue(
        `--uwt-inspector-inset-${side}`
      );
    open('right');
    expect(inset('right')).toBe('512px');
    expect(inset('left')).toBe('');
    expect(inset('bottom')).toBe('');

    key('ArrowLeft');
    expect(inset('right')).toBe('544px');

    fixture.destroy();
    expect(inset('right')).toBe('');
  });

  it('should give the app its padding back when it closes', () => {
    document.body.style.paddingLeft = '7px';
    open('left');
    expect(document.body.style.paddingLeft).toBe('512px');

    fixture.destroy();
    expect(document.body.style.paddingLeft).toBe('7px');
  });

  it('should open at its remembered size, within 30rem and 80% of the width', () => {
    localStorage.setItem(
      UWT_INSPECTOR_PREFERENCES_KEY,
      JSON.stringify({ paneSize: { right: 2000 } })
    );
    open('right');
    expect(host().style.width).toBe('819px');

    fixture.destroy();
    localStorage.setItem(
      UWT_INSPECTOR_PREFERENCES_KEY,
      JSON.stringify({ paneSize: { right: 100 } })
    );
    open('right');
    expect(host().style.width).toBe('480px');
  });

  it('should resize with the arrow keys, and remember the size', () => {
    open('right');

    key('ArrowLeft');
    expect(host().style.width).toBe('544px');
    key('ArrowRight');
    key('ArrowRight');
    expect(host().style.width).toBe('480px');
    expect(stored().paneSize).toEqual({ right: 480 });

    key('ArrowUp');
    expect(host().style.width).toBe('480px');
  });

  it('should resize by dragging its inner edge, and remember the size', () => {
    open('right');

    pointer('pointerdown', 512);
    pointer('pointermove', 400);
    expect(host().style.width).toBe('624px');
    expect(document.body.style.paddingRight).toBe('624px');
    expect(stored().paneSize).toBeUndefined();

    pointer('pointerup', 400);
    expect(stored().paneSize).toEqual({ right: 624 });

    pointer('pointermove', 100);
    expect(host().style.width).toBe('624px');
  });

  it('should dock at the bottom, 45% high, resized upwards', () => {
    open('bottom');

    expect(host().style.height).toBe('346px');
    expect(document.body.style.paddingBottom).toBe('346px');
    key('ArrowUp');
    expect(host().style.height).toBe('378px');
    pointer('pointerdown', 0, 400);
    pointer('pointermove', 0, 300);
    expect(host().style.height).toBe('468px');
  });

  it('should name its edge as a separator with its size and limits', () => {
    open('left');

    expect(handle().getAttribute('role')).toBe('separator');
    expect(handle().getAttribute('aria-orientation')).toBe('vertical');
    expect(handle().getAttribute('aria-label')).toBe(
      'Resize the Event Inspector'
    );
    expect(handle().getAttribute('aria-valuenow')).toBe('512');
    expect(handle().getAttribute('aria-valuemin')).toBe('480');
    expect(handle().getAttribute('aria-valuemax')).toBe('819');
  });
});
