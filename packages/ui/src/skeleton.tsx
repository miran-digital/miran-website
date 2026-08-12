import type { CSSProperties } from 'react';

type SkeletonProps = {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  className?: string;
};

export function Skeleton({ width = '100%', height = '1rem', radius, className = '' }: SkeletonProps) {
  return <span className={`miran-skeleton ${className}`.trim()} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
