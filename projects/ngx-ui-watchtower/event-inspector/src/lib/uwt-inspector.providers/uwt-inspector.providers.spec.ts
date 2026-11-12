import { UWT_DEFAULT_INSPECTOR_SHORTCUTS } from '../uwt-inspector-shortcut/uwt-inspector-shortcut';
import { UWT_DEFAULT_INSPECTOR_CONFIG } from '../uwt-inspector-store/uwt-inspector-store';
import { uwtInspectorConfig } from './uwt-inspector.providers';

describe('uwtInspectorConfig', () => {
  it('should lay the overrides over the defaults', () => {
    const shortcuts = [{ code: 'F9' }];

    expect(
      uwtInspectorConfig({ shortcuts, maxEventsPerSection: 50, enabled: false })
    ).toEqual({
      ...UWT_DEFAULT_INSPECTOR_CONFIG,
      shortcuts,
      maxEventsPerSection: 50,
      enabled: false
    });
  });

  it('should keep the default for an option left undefined', () => {
    expect(
      uwtInspectorConfig({
        enabled: undefined,
        shortcuts: undefined,
        maxEventsPerSection: undefined,
        captureBeforeOpen: undefined
      })
    ).toEqual({
      ...UWT_DEFAULT_INSPECTOR_CONFIG,
      shortcuts: UWT_DEFAULT_INSPECTOR_SHORTCUTS
    });
  });

  it('should take counts as whole numbers, keeping the default for one it cannot use', () => {
    expect(
      uwtInspectorConfig({
        maxEventsPerSection: 2.5,
        captureBeforeOpen: -1,
        maxPayloadCharsInView: Number.NaN
      })
    ).toMatchObject({
      maxEventsPerSection: 2,
      captureBeforeOpen: UWT_DEFAULT_INSPECTOR_CONFIG.captureBeforeOpen,
      maxPayloadCharsInView: UWT_DEFAULT_INSPECTOR_CONFIG.maxPayloadCharsInView
    });
    expect(uwtInspectorConfig({ maxEventsPerSection: 0 })).toMatchObject({
      maxEventsPerSection: UWT_DEFAULT_INSPECTOR_CONFIG.maxEventsPerSection
    });
  });
});
