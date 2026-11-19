import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { validatePasswordPolicy } from '../utils/passwordPolicy';
import type { User } from '../types';

interface PasswordChangePromptProps {
  user: User;
  forced: boolean;
  warningDays?: number;
  onSubmit: (password: string) => void;
  onClose?: () => void;
}

export default function PasswordChangePrompt({ user, forced, warningDays, onSubmit, onClose }: PasswordChangePromptProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const policyError = validatePasswordPolicy(password, user.username, user.role, user.passwordHistory || []);
    if (policyError) return setError(policyError);
    if (password !== confirmation) return setError('The passwords do not match.');
    setError('');
    onSubmit(password);
  };

  return (
    <div className="modal-backdrop z-[100] animate-fade-in">
      <form onSubmit={submit} className="modal-panel !max-w-md space-y-4 p-5 sm:p-6 text-left">
        <div className="w-11 h-1 rounded-full bg-[#1B4332]/20 mx-auto sm:hidden" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D6EFD9] text-[#1B4332] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-[#1B4332]">
              {forced ? 'Change your password' : 'Password expiry reminder'}
            </h2>
            <p className="text-sm text-[#455C50]">
              {forced
                ? 'Your password must be changed before continuing.'
                : `Your password expires in ${warningDays} day${warningDays === 1 ? '' : 's'}.`}
            </p>
          </div>
        </div>

        <ul className="dim-card-warm rounded-2xl p-3.5 pl-8 list-disc text-xs sm:text-sm text-[#354B40] space-y-1">
          <li>At least 12 characters</li>
          <li>Uppercase, lowercase, number, and special character</li>
          <li>Must not include your username, role, “password”, 12345, or qwerty</li>
          <li>Cannot reuse any of your last five passwords</li>
        </ul>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="new-password-input" className="block text-sm font-bold text-[#1B4332]">
              New password
            </label>
            <input
              id="new-password-input"
              autoComplete="new-password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter a strong new password"
              className="form-input px-3.5 py-3 text-base font-semibold"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="confirm-password-input" className="block text-sm font-bold text-[#1B4332]">
              Confirm new password
            </label>
            <input
              id="confirm-password-input"
              autoComplete="new-password"
              type="password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="Re-enter your new password"
              className="form-input px-3.5 py-3 text-base font-semibold"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">
            {error}
          </p>
        )}

        <div className="flex gap-2.5 pt-1">
          {!forced && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="btn-bevel-secondary flex-1 rounded-xl px-4 py-3 text-sm font-extrabold cursor-pointer"
            >
              Later
            </button>
          )}
          <button
            type="submit"
            className="btn-bevel-forest flex-1 rounded-xl px-4 py-3 text-sm font-extrabold cursor-pointer"
          >
            Update password
          </button>
        </div>
      </form>
    </div>
  );
}
