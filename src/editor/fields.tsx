import type { ReactNode } from 'react';
import type { TextStyle } from '../core';
import { useEditor } from './store';

export function NumberField({
  label,
  value,
  onChange,
  step = 1
}: {
  label: string;
  value: number;
  onChange(next: number): void;
  step?: number;
}) {
  return (
    <label className="pde-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(1))}
        step={step}
        onChange={e => {
          const n = Number(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange(next: string): void;
}) {
  return (
    <label className="pde-field">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange
}: {
  label: ReactNode;
  checked: boolean;
  onChange(next: boolean): void;
}) {
  return (
    <label className="pde-field pde-field--row">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/** Friendly names for the default wizard fonts; unknown families pass through. */
export const FONT_LABELS: Record<string, string> = {
  body: 'Normal',
  'body-bold': 'Negrita',
  'body-italic': 'Cursiva'
};

export const fontLabel = (family: string) => FONT_LABELS[family] ?? family;

/** Compact font/size/color editor shared by elements and flow items. */
export function StyleFields({
  style,
  onChange,
  withAlign = true
}: {
  style: TextStyle;
  onChange(patch: Partial<TextStyle>): void;
  withAlign?: boolean;
}) {
  const fonts = useEditor(s => s.template.fonts);
  return (
    <>
      <div className="pde-props__grid">
        <SelectField
          label="Fuente"
          value={style.font}
          options={fonts.map(f => ({ value: f.family, label: fontLabel(f.family) }))}
          onChange={font => onChange({ font })}
        />
        <NumberField
          label="Tamaño"
          value={style.size}
          step={0.5}
          onChange={size => onChange({ size })}
        />
      </div>
      <div className="pde-props__grid">
        <label className="pde-field">
          <span>Color</span>
          <input
            type="color"
            value={style.color}
            onChange={e => onChange({ color: e.target.value })}
          />
        </label>
        {withAlign && (
          <SelectField
            label="Alineación"
            value={style.align ?? 'left'}
            options={[
              { value: 'left', label: 'Izquierda' },
              { value: 'center', label: 'Centro' },
              { value: 'right', label: 'Derecha' }
            ]}
            onChange={align =>
              onChange({ align: align as TextStyle['align'] })
            }
          />
        )}
      </div>
    </>
  );
}
