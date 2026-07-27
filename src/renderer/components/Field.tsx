import {
  cloneElement,
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

interface FieldProps {
  label: ReactNode;
  children: ReactElement<FieldControlProps>;
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
  const generatedId = useId();
  const controlId = children.props.id ?? `field-${generatedId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [
    children.props['aria-describedby'],
    hintId,
    errorId,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  const control = cloneElement(children, {
    id: controlId,
    required: required || children.props.required,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : children.props['aria-invalid'],
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
