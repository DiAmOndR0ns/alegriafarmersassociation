import React, { ReactNode } from 'react';

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  notice?: ReactNode;
  icon?: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmationModal({
  isOpen,
  title,
  description,
  notice,
  icon,
  cancelLabel = 'Kanselahon',
  confirmLabel = 'Ipadayon',
  confirmVariant = 'primary',
  onCancel,
  onConfirm
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const confirmBtnClass =
    confirmVariant === 'danger'
      ? 'btn-bevel-terracotta flex-1 py-3 px-4 rounded-xl text-sm font-extrabold cursor-pointer'
      : 'btn-bevel-forest flex-1 py-3 px-4 rounded-xl text-sm font-extrabold cursor-pointer';

  return (
    <div className="modal-backdrop z-[70] animate-fade-in text-left" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="modal-panel dim-card-warm !max-w-md p-5 sm:p-6 space-y-4"
      >
        <div className="w-11 h-1 rounded-full bg-[#1B4332]/20 mx-auto sm:hidden" aria-hidden="true" />
        <div className="flex items-center gap-3 border-b border-[#E5DEC9] pb-3.5">
          {icon && (
            <div className="w-11 h-11 rounded-2xl bg-[#FFF0C2] border border-[#E9B34A]/50 flex items-center justify-center text-[#8A5404] shrink-0">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-display font-bold text-[#1B4332] text-lg leading-snug">{title}</h3>
          </div>
        </div>

        <div className="dim-card p-4 rounded-2xl space-y-2.5">
          <p className="text-sm text-[#18372D] leading-relaxed font-medium">
            {description}
          </p>
          {notice && (
            <div className="p-3 bg-[#EAF6EE] border border-[#1B4332]/20 rounded-xl text-[#1B4332] text-xs font-semibold">
              {notice}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="btn-bevel-secondary py-3 px-4 rounded-xl text-sm font-extrabold cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={confirmBtnClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
