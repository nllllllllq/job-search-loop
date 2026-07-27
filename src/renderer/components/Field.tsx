import {
  cloneElement,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  useId,
} from 'react';

interface FieldControlProps {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true';
  id?: string;
  required?: boolean;
}

/**
 * Field deliberately accepts intrinsic controls only so generated ids and
 * accessibility attributes always reach the focusable DOM element.
 */
export type NativeFieldControl =
  | ReactElement<ComponentPropsWithoutRef<'input'>, 'input'>
  | ReactElement<ComponentPropsWithoutRef<'textarea'>, 'textarea'>
  | ReactElement<ComponentPropsWithoutRef<'select'>, 'select'>;

export interface FieldProps {
  label: ReactNode;
  children: NativeFieldControl;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}

export function Field({
  label,
  children,
  hint,
  error,
  required = false,
}: FieldProps) {
  if (
    typeof children.type !== 'string' ||
    !['input', 'textarea', 'select'].includes(children.type)
  ) {
    throw new Error(
      'Field only accepts a native input, textarea, or select element.',
    );
  }

  const nativeControl = children as ReactElement<FieldControlProps>;
  const generatedId = useId();
  const controlId = nativeControl.props.id ?? `field-${generatedId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [
    nativeControl.props['aria-describedby'],
    hintId,
    errorId,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  const control = cloneElement(nativeControl, {
    id: controlId,
    required: required || nativeControl.props.required,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : nativeControl.props['aria-invalid'],
  });

  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label className="field__label" htmlFor={controlId}>
        {label}
        {required ? (
          <span className="field__required" aria-label="必填">
            *
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
