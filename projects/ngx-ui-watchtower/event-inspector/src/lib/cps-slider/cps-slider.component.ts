import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { CpsInfoCircleComponent, CpsTooltipPosition } from 'cps-ui-kit';

let nextId = 0;

/**
 * CpsSliderComponent picks a number from a range by dragging a thumb along a
 * track, or with the arrow, Page Up/Down, Home and End keys.
 *
 * Written to cps-ui-kit's conventions, which has no slider yet, and kept in
 * its own folder so it can move into the kit unchanged. Depends only on
 * Angular and cps-ui-kit's public API.
 * @group Components
 */
@Component({
  selector: 'cps-slider',
  imports: [CpsInfoCircleComponent],
  templateUrl: './cps-slider.component.html',
  styleUrl: './cps-slider.component.scss'
})
export class CpsSliderComponent implements ControlValueAccessor {
  /**
   * Label of the slider component.
   * @group Props
   */
  @Input() label = '';

  /**
   * Aria label for the slider component, used for accessibility, it takes precedence over label.
   * @group Props
   */
  @Input() ariaLabel = '';

  /**
   * Lowest value of the slider.
   * @group Props
   */
  @Input() min = 0;

  /**
   * Highest value of the slider.
   * @group Props
   */
  @Input() max = 100;

  /**
   * Difference between two neighbouring values.
   * @group Props
   */
  @Input() step = 1;

  /**
   * Width of the track, of type number denoting pixels or string.
   * @group Props
   */
  @Input() width: number | string = '10rem';

  /**
   * Determines whether the current value is shown next to the track.
   * @group Props
   */
  @Input() showValue = false;

  /**
   * Text appended to the shown and announced value, e.g. '%'.
   * @group Props
   */
  @Input() valueSuffix = '';

  /**
   * Determines whether the slider component is disabled.
   * @group Props
   */
  @Input() disabled = false;

  /**
   * When it is not an empty string, an info icon is displayed to show text for more info.
   * @group Props
   */
  @Input() infoTooltip = '';

  /**
   * InfoTooltip class for styling.
   * @group Props
   */
  @Input() infoTooltipClass = 'cps-tooltip-content';

  /**
   * Size of infoTooltip, of type number denoting pixels or string.
   * @group Props
   */
  @Input() infoTooltipMaxWidth: number | string = '100%';

  /**
   * Determines whether the infoTooltip is persistent.
   * @group Props
   */
  @Input() infoTooltipPersistent = false;

  /**
   * Position of infoTooltip, it can be 'top', 'bottom', 'left' or 'right'.
   * @group Props
   */
  @Input() infoTooltipPosition: CpsTooltipPosition = 'top';

  /**
   * Value of the slider component.
   * @default 0
   * @group Props
   */
  @Input() value = 0;

  /**
   * Callback to invoke on value change.
   * @param {number} number - value changed.
   * @group Emits
   */
  @Output() valueChanged = new EventEmitter<number>();

  readonly inputId = `cps-slider-${nextId++}`;

  private readonly _control = inject(NgControl, {
    self: true,
    optional: true
  });

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onChange = (_value: number) => {};

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onTouched = () => {};

  constructor() {
    if (this._control) {
      this._control.valueAccessor = this;
    }
  }

  get cvtWidth(): string {
    return typeof this.width === 'number' ? `${this.width}px` : this.width;
  }

  /** How far along the track the value is, for the filled part. */
  get fill(): string {
    const span = this.max - this.min;
    const ratio = span > 0 ? (this.value - this.min) / span : 0;
    return `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
  }

  get valueText(): string {
    return `${this.value}${this.valueSuffix}`;
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  writeValue(value: number | null): void {
    this.value = typeof value === 'number' ? value : this.min;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }

  updateValueEvent(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.value = value;
    this.onChange(value);
    this.valueChanged.emit(value);
  }
}
