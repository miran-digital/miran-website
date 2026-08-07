import type { HTMLAttributes, ReactNode } from 'react';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
};

export function Badge({ children, className = '', tone = 'neutral', ...props }: BadgeProps) {
  return <span className={`miran-badge miran-badge--${tone} ${className}`.trim()} {...props}>{children}</span>;
}
