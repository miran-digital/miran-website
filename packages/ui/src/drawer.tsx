'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  side?: 'inline-start' | 'inline-end';
};

export function Drawer({ open, onOpenChange, title, children, side = 'inline-start' }: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`miran-drawer miran-drawer--${side}`}
      aria-labelledby={titleId}
      onClose={() => onOpenChange(false)}
    >
      <div className="miran-drawer__header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="miran-drawer__close" onClick={() => dialogRef.current?.close()} aria-label="بستن">×</button>
      </div>
      <div className="miran-drawer__body">{children}</div>
    </dialog>
  );
}
