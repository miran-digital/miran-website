import type { HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md';
};

export function Card({ children, className = '', padding = 'md', ...props }: CardProps) {
  return <div className={`miran-card miran-card--padding-${padding} ${className}`.trim()} {...props}>{children}</div>;
}

