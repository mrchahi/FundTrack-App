import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface MaterialFieldProps {
  label?: string;
  hint?: string;
  error?: string;
  warning?: string;
  success?: string;
  disabled?: boolean;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const MaterialField: React.FC<MaterialFieldProps> = ({
  label,
  hint,
  error,
  warning,
  success,
  disabled = false,
  required = false,
  children,
  className = '',
}) => {
  const toneClass = disabled
    ? 'md-field--disabled'
    : error
    ? 'md-field--error'
    : warning
    ? 'md-field--warning'
    : success
    ? 'md-field--success'
    : '';

  const message = error || warning || success || hint;
  const helperTone = error
    ? 'md-helper--error'
    : warning
    ? 'md-helper--warning'
    : success
    ? 'md-helper--success'
    : '';

  return (
    <div className={`md-field ${toneClass} ${className}`}>
      {label && (
        <label className="md-field-label">
          <span>
            {label}
            {required && <span className="text-[var(--ft-danger)] ms-0.5">*</span>}
          </span>
        </label>
      )}
      {children}
      {message && (
        <div className={`md-helper ${helperTone}`}>
          {error && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {!error && warning && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          {!error && !warning && success && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          <span>{message}</span>
        </div>
      )}
    </div>
  );
};

interface MaterialInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  warning?: string;
  success?: string;
  ltrNum?: boolean;
  fieldSize?: 'sm' | 'md';
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  containerClassName?: string;
}

export const MaterialInput: React.FC<MaterialInputProps> = ({
  label,
  hint,
  error,
  warning,
  success,
  disabled = false,
  required = false,
  ltrNum = false,
  fieldSize = 'md',
  startIcon,
  endIcon,
  value,
  className = '',
  containerClassName = '',
  ...rest
}) => {
  const isFilled = value !== undefined && String(value).trim().length > 0;

  return (
    <MaterialField
      label={label}
      hint={hint}
      error={error}
      warning={warning}
      success={success}
      disabled={disabled}
      required={required}
      className={containerClassName}
    >
      <div
        className={`md-field-box ${isFilled ? 'md-field-box--filled' : ''} ${
          disabled ? 'md-field-box--disabled' : ''
        }`}
      >
        {startIcon && (
          <span className="ps-3 text-[var(--ft-text-muted)] shrink-0 flex items-center">
            {startIcon}
          </span>
        )}
        <input
          value={value}
          disabled={disabled}
          required={required}
          className={`md-input ${fieldSize === 'sm' ? 'md-input--sm' : 'md-input--md'} ${
            ltrNum ? 'font-num' : ''
          } ${startIcon ? 'ps-1' : ''} ${endIcon ? 'pe-1' : ''} ${className}`}
          {...rest}
        />
        {endIcon && (
          <span className="pe-3 text-[var(--ft-text-muted)] shrink-0 flex items-center">
            {endIcon}
          </span>
        )}
      </div>
    </MaterialField>
  );
};

interface MaterialTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  warning?: string;
  success?: string;
  containerClassName?: string;
}

export const MaterialTextarea: React.FC<MaterialTextareaProps> = ({
  label,
  hint,
  error,
  warning,
  success,
  disabled = false,
  required = false,
  value,
  className = '',
  containerClassName = '',
  ...rest
}) => {
  const isFilled = value !== undefined && String(value).trim().length > 0;

  return (
    <MaterialField
      label={label}
      hint={hint}
      error={error}
      warning={warning}
      success={success}
      disabled={disabled}
      required={required}
      className={containerClassName}
    >
      <div
        className={`md-field-box ${isFilled ? 'md-field-box--filled' : ''} ${
          disabled ? 'md-field-box--disabled' : ''
        }`}
      >
        <textarea
          value={value}
          disabled={disabled}
          required={required}
          className={`md-input md-input--md resize-y ${className}`}
          {...rest}
        />
      </div>
    </MaterialField>
  );
};
