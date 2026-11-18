import React, { useState } from 'react';
import { DelegationRequest, DelegationScope, OfficerRole, User } from '../types';
import { DELEGATION_SCOPE_LABELS, DELEGATION_SCOPES } from '../utils/delegation';

interface DelegationAccessPanelProps {
  currentRole: OfficerRole;
  currentUserId?: string;
  users: User[];
  requests: DelegationRequest[];
  isOnline: boolean;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  onRequest: (request: {
    reason: string;
    scopes: DelegationScope[];
    effectiveStart: string;
    effectiveEnd: string;
  }) => Promise<boolean>;
  onReview: (requestId: string, decision: 'approve' | 'decline', remarks?: string) => Promise<boolean>;
  onRevoke: (requestId: string, remarks?: string) => Promise<boolean>;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function DelegationAccessPanel({
  currentRole,
  currentUserId,
  users,
  requests,
  isOnline,
  isRefreshing,
  onRefresh,
  onRequest,
  onReview,
  onRevoke
}: DelegationAccessPanelProps) {
  const [reason, setReason] = useState('');
  const [scopes, setScopes] = useState<DelegationScope[]>([]);
  const [effectiveStart, setEffectiveStart] = useState(today());
  const [effectiveEnd, setEffectiveEnd] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 7);
    return end.toISOString().slice(0, 10);
  });
  const [remarksById, setRemarksById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isPresident = currentRole === 'President';
  const visibleRequests = isPresident
    ? [...requests].sort((a, b) => b.requestedDate.localeCompare(a.requestedDate))
    : requests.filter(request => request.requestedBy === currentUserId);
  const displayName = (userId: string) => users.find(user => user.id === userId)?.name || userId;

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim() || scopes.length === 0 || !effectiveStart || !effectiveEnd || !isOnline) return;
    setBusy(true);
    try {
      const saved = await onRequest({ reason: reason.trim(), scopes, effectiveStart, effectiveEnd });
      if (saved) {
        setReason('');
        setScopes([]);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReview = async (requestId: string, decision: 'approve' | 'decline') => {
    setBusy(true);
    try {
      const saved = await onReview(requestId, decision, remarksById[requestId]?.trim() || undefined);
      if (saved) setRemarksById(previous => ({ ...previous, [requestId]: '' }));
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (requestId: string) => {
    setBusy(true);
    try {
      const saved = await onRevoke(requestId, remarksById[requestId]?.trim() || undefined);
      if (saved) setRemarksById(previous => ({ ...previous, [requestId]: '' }));
    } finally {
      setBusy(false);
    }
  };

  const toggleScope = (scope: DelegationScope) => {
    setScopes(current => current.includes(scope)
      ? current.filter(item => item !== scope)
      : [...current, scope]);
  };

  return (
    <section className="bg-white border border-[#D5CFC1] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-[#1B4332]">Delegated President Access</h3>
          <p className="text-xs text-[#5D6B54] mt-1">
            Access is limited to the approved capabilities and date range. It expires automatically and the President may revoke it.
          </p>
        </div>
        <button
          type="button"
          disabled={!isOnline || isRefreshing}
          onClick={() => void onRefresh()}
          className="shrink-0 px-3 py-2 border border-[#D5CFC1] rounded-lg text-xs font-bold disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {!isPresident && (
        <form onSubmit={handleRequest} className="border border-[#E9E4D9] bg-[#FAF8F5] rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-[#1B4332]">Request temporary access</h4>
          <label className="block text-xs font-semibold text-[#4F5E46]">
            Reason
            <textarea
              value={reason}
              onChange={event => setReason(event.target.value)}
              maxLength={2000}
              required
              rows={2}
              className="mt-1 w-full px-3 py-2 bg-white border border-[#D5CFC1] rounded-lg text-xs"
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-[#4F5E46]">Requested capabilities</legend>
            {DELEGATION_SCOPES.map(scope => (
              <label key={scope} className="flex items-center gap-2 text-xs text-[#2D3A22]">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                {DELEGATION_SCOPE_LABELS[scope]}
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-[#4F5E46]">
              Starts
              <input
                type="date"
                min={today()}
                value={effectiveStart}
                onChange={event => setEffectiveStart(event.target.value)}
                required
                className="mt-1 w-full px-3 py-2 bg-white border border-[#D5CFC1] rounded-lg text-xs"
              />
            </label>
            <label className="text-xs font-semibold text-[#4F5E46]">
              Expires
              <input
                type="date"
                min={effectiveStart || today()}
                value={effectiveEnd}
                onChange={event => setEffectiveEnd(event.target.value)}
                required
                className="mt-1 w-full px-3 py-2 bg-white border border-[#D5CFC1] rounded-lg text-xs"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy || !isOnline || scopes.length === 0}
            className="px-4 py-2 bg-[#1B4332] text-white rounded-lg text-xs font-bold disabled:opacity-50"
          >
            {isOnline ? 'Send request to President' : 'Connect to request access'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-[#4F5E46]">
          {isPresident ? 'Requests and active delegations' : 'Your requests'}
        </h4>
        {visibleRequests.length === 0 ? (
          <p className="text-xs text-[#85947E]">No delegation requests.</p>
        ) : visibleRequests.map(request => {
          const expired = request.status === 'Approved' && request.effectiveEnd < today();
          const canRevoke = isPresident && request.status === 'Approved' && !expired;
          return (
            <article key={request.id} className="border border-[#E9E4D9] rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-xs text-[#1B4332]">{displayName(request.requestedBy)}</strong>
                <span className="text-[10px] font-bold px-2 py-1 bg-[#EAF4EC] rounded-full">
                  {expired ? 'Expired' : request.status}
                </span>
              </div>
              <p className="text-xs text-[#2D3A22]">{request.reason}</p>
              <p className="text-[11px] text-[#5D6B54]">
                {request.effectiveStart} to {request.effectiveEnd}
              </p>
              <div className="flex flex-wrap gap-1">
                {(request.scopes || []).map(scope => (
                  <span key={scope} className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                    {DELEGATION_SCOPE_LABELS[scope]}
                  </span>
                ))}
              </div>
              {request.remarks && <p className="text-[11px] text-[#5D6B54]">Review note: {request.remarks}</p>}
              {isPresident && (request.status === 'Pending' || canRevoke) && (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    value={remarksById[request.id] || ''}
                    onChange={event => setRemarksById(previous => ({ ...previous, [request.id]: event.target.value }))}
                    maxLength={2000}
                    placeholder="Optional review or revocation note"
                    className="flex-1 px-3 py-2 border border-[#D5CFC1] rounded-lg text-xs"
                  />
                  {request.status === 'Pending' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy || !isOnline}
                        onClick={() => void handleReview(request.id, 'approve')}
                        className="px-3 py-2 bg-[#1B4332] text-white rounded-lg text-xs font-bold disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy || !isOnline}
                        onClick={() => void handleReview(request.id, 'decline')}
                        className="px-3 py-2 bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !isOnline}
                      onClick={() => void handleRevoke(request.id)}
                      className="px-3 py-2 bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
