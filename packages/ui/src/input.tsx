import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ className = '', invalid = false, ...props }: InputProps) {
  return <input className={`miran-input ${className}`.trim()} aria-invalid={invalid || undefined} {...props} />;
}
