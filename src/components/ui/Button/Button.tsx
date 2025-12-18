import { forwardRef } from 'react';
import { cn } from '@/lib/utils/cn';
import styles from './Button.module.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading,
      fullWidth,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          styles.button,
          styles[variant],
          styles[size],
          loading && styles.loading,
          fullWidth && styles.fullWidth,
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <span className={styles.spinner} />}
        <span className={loading ? styles.hiddenText : undefined}>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
