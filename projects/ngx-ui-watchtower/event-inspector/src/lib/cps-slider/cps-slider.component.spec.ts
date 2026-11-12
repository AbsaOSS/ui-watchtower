import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CpsSliderComponent } from './cps-slider.component';

describe('CpsSliderComponent', () => {
  let fixture: ComponentFixture<CpsSliderComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const input = () =>
    el().querySelector('[data-testid="cps-slider-input"]') as HTMLInputElement;

  /** What a user's drag or key press does to the native input. */
  function slideTo(value: number): void {
    input().value = String(value);
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CpsSliderComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(CpsSliderComponent);
  });

  it('should label the range input and show its value with the suffix', () => {
    fixture.componentRef.setInput('label', 'Transparency');
    fixture.componentRef.setInput('max', 70);
    fixture.componentRef.setInput('value', 30);
    fixture.componentRef.setInput('showValue', true);
    fixture.componentRef.setInput('valueSuffix', '%');
    fixture.detectChanges();

    const label = el().querySelector('label') as HTMLLabelElement;
    expect(label.textContent).toBe('Transparency');
    expect(label.htmlFor).toBe(input().id);
    expect(input().type).toBe('range');
    expect(input().max).toBe('70');
    expect(input().value).toBe('30');
    expect(input().getAttribute('aria-valuetext')).toBe('30%');
    expect(
      el().querySelector('[data-testid="cps-slider-value"]')?.textContent
    ).toBe('30%');
  });

  it('should emit the new value as a number and move the fill', () => {
    const emitted: number[] = [];
    fixture.componentInstance.valueChanged.subscribe((v) => emitted.push(v));
    fixture.componentRef.setInput('min', 0);
    fixture.componentRef.setInput('max', 80);
    fixture.componentRef.setInput('step', 5);
    fixture.detectChanges();

    slideTo(20);

    expect(emitted).toEqual([20]);
    expect(input().style.getPropertyValue('--cps-slider-fill')).toBe('25%');
  });

  it('should use ariaLabel over label for the accessible name', () => {
    fixture.componentRef.setInput('label', 'Transparency');
    fixture.componentRef.setInput('ariaLabel', 'Window transparency');
    fixture.detectChanges();

    expect(input().getAttribute('aria-label')).toBe('Window transparency');
  });

  it('should not move when disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    expect(input().disabled).toBe(true);
    expect(el().querySelector('.cps-slider-container')?.classList).toContain(
      'cps-slider-disabled'
    );
  });

  describe('in a reactive form', () => {
    @Component({
      imports: [CpsSliderComponent, ReactiveFormsModule],
      template: `<cps-slider label="Level" [formControl]="control" />`
    })
    class HostComponent {
      readonly control = new FormControl(40);
    }

    let host: ComponentFixture<HostComponent>;
    const hostInput = () =>
      host.nativeElement.querySelector('input') as HTMLInputElement;

    beforeEach(() => {
      host = TestBed.createComponent(HostComponent);
      host.detectChanges();
    });

    it('should show the control value and write user changes back', () => {
      expect(hostInput().value).toBe('40');

      hostInput().value = '60';
      hostInput().dispatchEvent(new Event('input'));

      expect(host.componentInstance.control.value).toBe(60);
    });

    it('should follow the control being disabled', () => {
      host.componentInstance.control.disable();
      host.detectChanges();

      expect(hostInput().disabled).toBe(true);
    });
  });
});
