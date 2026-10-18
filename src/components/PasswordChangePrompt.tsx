import React, { useState } from 'react';
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-[#1B4332]">{forced ? 'Change your password' : 'Password expiry reminder'}</h2>
        <p className="text-sm text-slate-600">{forced ? 'Your password must be changed before continuing.' : `Your password expires in ${warningDays} day${warningDays === 1 ? '' : 's'}.`}</p>
        <ul className="list-disc pl-5 text-xs text-slate-600">
          <li>At least 12 characters</li><li>Uppercase, lowercase, number, and special character</li>
          <li>Must not include your username, role, “password”, 12345, or qwerty</li>
          <li>Cannot reuse any of your last five passwords</li>
        </ul>
        <input autoComplete="new-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="w-full rounded-lg border p-3" />
        <input autoComplete="new-password" type="password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirm new password" className="w-full rounded-lg border p-3" />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          {!forced && onClose && <button type="button" onClick={onClose} className="flex-1 rounded-lg border p-3">Later</button>}
          <button type="submit" className="flex-1 rounded-lg bg-[#1B4332] p-3 font-bold text-white">Update password</button>
        </div>
      </form>
    </div>
  );
}
