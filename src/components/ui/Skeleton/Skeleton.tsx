import { forwardRef } from 'react';
import { cn } from '@/lib/utils/cn';
import styles from './Skeleton.module.css';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  (
    { className, variant = 'rectangular', width, height, animation = 'pulse', style, ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          styles.skeleton,
          styles[variant],
          animation !== 'none' && styles[animation],
          className
        )}
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height: typeof height === 'number' ? `${height}px` : height,
          ...style,
        }}
        aria-hidden="true"
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

// Convenience components for common patterns
export const SkeletonText = forwardRef<
  HTMLDivElement,
  Omit<SkeletonProps, 'variant'> & { lines?: number }
>(({ lines = 1, className, ...props }, ref) => {
  if (lines === 1) {
    return <Skeleton ref={ref} variant="text" className={className} {...props} />;
  }

  return (
    <div className={cn(styles.textGroup, className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" width={i === lines - 1 ? '60%' : '100%'} {...props} />
      ))}
    </div>
  );
});

SkeletonText.displayName = 'SkeletonText';

export const SkeletonAvatar = forwardRef<
  HTMLDivElement,
  Omit<SkeletonProps, 'variant'> & { size?: number }
>(({ size = 40, ...props }, ref) => {
  return <Skeleton ref={ref} variant="circular" width={size} height={size} {...props} />;
});

SkeletonAvatar.displayName = 'SkeletonAvatar';
