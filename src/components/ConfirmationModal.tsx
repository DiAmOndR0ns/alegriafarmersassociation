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
      ? 'flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer'
      : 'flex-1 py-2.5 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-fade-in text-left">
      <div className="bg-[#FAF8F5] border-2 border-amber-600/50 w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-[#D5CFC1] pb-3.5">
          {icon && (
            <div className="w-11 h-11 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-800 shrink-0">
              {icon}
            </div>
          )}
          <div>
            <h3 className="font-extrabold text-[#1B4332] text-base">{title}</h3>
          </div>
        </div>

        <div className="bg-white border border-[#D5CFC1] p-4 rounded-2xl space-y-2">
          <p className="text-xs text-[#1B4332] leading-relaxed font-medium">
            {description}
          </p>
          {notice && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold">
              {notice}
            </div>
          )}
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 bg-white hover:bg-[#F0EDE7] text-[#4A5F57] rounded-xl text-xs font-bold border border-[#D5CFC1] transition-all cursor-pointer"
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
