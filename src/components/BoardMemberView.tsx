import React, { useState } from 'react';
import { FileCheck, Plus, ShieldCheck } from 'lucide-react';
import { Resolution, User } from '../types';

interface BoardMemberViewProps {
  resolutions: Resolution[];
  currentUser: User;
  onAddResolution: (resolution: Omit<Resolution, 'id' | 'status'>) => void;
}

export default function BoardMemberView({
  resolutions,
  currentUser,
  onAddResolution,
}: BoardMemberViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [resolutionNumber, setResolutionNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [secondedBy, setSecondedBy] = useState('');
  const pending = resolutions.filter((resolution) => resolution.status === 'Pending Approval');

  const submitProposal = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolutionNumber.trim() || !title.trim() || !description.trim()) return;

    onAddResolution({
      resolutionNumber: resolutionNumber.trim(),
      title: title.trim(),
      description: description.trim(),
      dateAgreed: new Date().toISOString().split('T')[0],
      movedBy: currentUser.name,
      secondedBy: secondedBy.trim() || 'Board Member',
      voteInFavor: 0,
      voteAgainst: 0,
      voteAbstain: 0,
    });

    setResolutionNumber('');
    setTitle('');
    setDescription('');
    setSecondedBy('');
    setShowForm(false);
  };

  return (
    <section className="space-y-5 text-left">
      <header className="rounded-2xl bg-[#1B4332] p-5 text-white">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-200" />
          <h2 className="text-lg font-black">Board Policy & Resolution Desk</h2>
        </div>
        <p className="mt-2 text-sm text-emerald-50">
          Draft and submit policy proposals for review. The President retains final approval authority.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wide text-[#1B4332]">Association Resolutions</h3>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((visible) => !visible)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B4332] px-3.5 py-2 text-xs font-black text-white hover:bg-[#143326]"
        >
          <Plus className="h-4 w-4" />
          Propose Policy
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitProposal} className="space-y-3 rounded-2xl border border-[#D5CFC1] bg-[#FAF8F5] p-4">
          <label className="block text-[11px] font-black uppercase text-[#1B4332]">
            Resolution Number
            <input
              required
              value={resolutionNumber}
              onChange={(event) => setResolutionNumber(event.target.value)}
              placeholder="e.g. Res. No. 2026-01"
              className="mt-1 w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2 text-sm font-semibold normal-case"
            />
          </label>
          <label className="block text-[11px] font-black uppercase text-[#1B4332]">
            Proposal Title
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2 text-sm font-semibold normal-case"
            />
          </label>
          <label className="block text-[11px] font-black uppercase text-[#1B4332]">
            Policy Details
            <textarea
              required
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2 text-sm font-semibold normal-case"
            />
          </label>
          <label className="block text-[11px] font-black uppercase text-[#1B4332]">
            Seconded By
            <input
              value={secondedBy}
              onChange={(event) => setSecondedBy(event.target.value)}
              placeholder="Optional"
              className="mt-1 w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2 text-sm font-semibold normal-case"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#1B4332] px-3.5 py-2 text-xs font-black text-white hover:bg-[#143326]"
            >
              Submit for Approval
            </button>
          </div>
        </form>
      )}

      {resolutions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D5CFC1] bg-[#FAF8F5] py-10 text-center text-xs font-semibold text-slate-600">
          No resolutions or policy proposals have been recorded.
        </div>
      ) : (
        <div className="space-y-3">
          {resolutions.map((resolution) => (
            <article key={resolution.id} className="rounded-2xl border border-[#D5CFC1] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">{resolution.resolutionNumber}</p>
                  <h4 className="mt-1 text-sm font-black text-[#1B4332]">{resolution.title}</h4>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                  resolution.status === 'Approved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : resolution.status === 'Archived'
                      ? 'bg-slate-100 text-slate-700'
                      : 'bg-amber-100 text-amber-900'
                }`}>
                  {resolution.status}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{resolution.description}</p>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                <FileCheck className="h-3.5 w-3.5" />
                Proposed by {resolution.movedBy} · {resolution.dateAgreed}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
