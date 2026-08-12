import type { HTMLAttributes, ReactNode } from 'react';

type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  size?: 'default' | 'wide';
};

export function Container({ children, className = '', size = 'default', ...props }: ContainerProps) {
  return (
    <div className={`miran-container miran-container--${size} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
