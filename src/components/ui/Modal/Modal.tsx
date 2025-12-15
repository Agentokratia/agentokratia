'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={cn(styles.content, styles[size])}>
          {title ? (
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          ) : (
            <VisuallyHidden.Root asChild>
              <Dialog.Title>Dialog</Dialog.Title>
            </VisuallyHidden.Root>
          )}
          {description && (
            <Dialog.Description className={styles.description}>
              {description}
            </Dialog.Description>
          )}
          <div className={styles.body}>{children}</div>
          <Dialog.Close asChild>
            <button className={styles.close} aria-label="Close">
              <X size={20} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ModalTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

export function ModalTrigger({ children, asChild }: ModalTriggerProps) {
  return <Dialog.Trigger asChild={asChild}>{children}</Dialog.Trigger>;
}
