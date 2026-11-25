
import React, { useMemo, useState } from 'react';
import { FinancialTransaction, AssociationActivity, Meeting } from '../types';
import {
  ShieldCheck, CheckCircle, X, Search,
  ArrowUpRight, ArrowDownRight, Calendar, Landmark, FileText, Coins, Filter
} from 'lucide-react';

interface ApprovedTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: FinancialTransaction[];
  activities?: AssociationActivity[];
  meetings?: Meeting[];
}

export default function ApprovedTransactionsModal({
  isOpen,
  onClose,
  transactions,
  activities = [],
  meetings = []
}: ApprovedTransactionsModalProps) {
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'income' | 'expense'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Strictly only transactions verified by the Auditor AND approved by the President
  const approvedTransactions = useMemo(() => {
    return (Array.isArray(transactions) ? transactions : [])
      .filter(tx => tx && tx.auditedStatus === 'Audited' && tx.presidentApprovalStatus === 'Approved')
      .slice()
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [transactions]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const tx of approvedTransactions) {
      const y = String(tx.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [approvedTransactions]);

  const activityById = useMemo(() => {
    const map = new Map<string, AssociationActivity>();
    for (const act of activities) {
      if (act?.id) map.set(act.id, act);
    }
    return map;
  }, [activities]);

  const meetingById = useMemo(() => {
    const map = new Map<string, Meeting>();
    for (const mtg of meetings) {
      if (mtg?.id) map.set(mtg.id, mtg);
    }
    return map;
  }, [meetings]);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return approvedTransactions.filter(tx => {
      if (selectedYear !== 'ALL' && !String(tx.date || '').startsWith(selectedYear)) {
        return false;
      }
      if (selectedType !== 'ALL' && tx.type !== selectedType) {
        return false;
      }
      if (q) {
        const linkedAct = tx.activityId ? activityById.get(tx.activityId)?.title || '' : '';
        const linkedMtg = tx.meetingId ? meetingById.get(tx.meetingId)?.title || '' : '';
        const haystack = [
          tx.category,
          tx.description,
          tx.purpose,
          tx.fundSource,
          tx.date,
          tx.auditedBy,
          tx.presidentApprovedBy,
          linkedAct,
          linkedMtg
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [approvedTransactions, selectedYear, selectedType, searchQuery, activityById, meetingById]);

  const summary = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    for (const tx of filteredTransactions) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income') totalIncome += amt;
      else totalExpense += amt;
    }
    return {
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      count: filteredTransactions.length
    };
  }, [filteredTransactions]);

  if (!isOpen) return null;

  const formatPhp = (value: number) =>
    `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      id="approved-transactions-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approved-transactions-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto no-print"
    >
      <div className="bg-[#FAF8F5] border-2 border-[#1B4332] rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-left">
        {/* MODAL HEADER */}
        <div className="bg-[#1B4332] text-white px-5 sm:px-6 py-4 flex items-start sm:items-center justify-between gap-4 shrink-0 border-b-4 border-[#F4C76D]">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#2D6A4F] border border-[#7EC79F]/40 flex items-center justify-center shrink-0 text-[#FFF0C2] shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="approved-transactions-modal-title" className="text-base sm:text-xl font-extrabold font-display tracking-tight text-white">
                  Approved Financial Transactions Ledger
                </h2>
                <span className="inline-flex items-center gap-1 bg-[#D6EFD9] text-[#1B4332] text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                  <CheckCircle className="w-3 h-3 text-[#1B4332]" />
                  Auditor &amp; President Approved
                </span>
              </div>
              <p className="text-xs text-[#D6EFD9] mt-0.5">
                Opisyal nga Talaan sa Pinansyal nga Gisusi sa Auditor ug Gi-aprobahan sa Presidente • Viewable by All AFA Members &amp; Officers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Approved Financial Ledger"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* TRANSPARENCY NOTICE BANNER */}
          <div className="bg-[#EAF4EC] border border-[#7EC79F] rounded-2xl p-3.5 sm:p-4 flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-xl bg-[#1B4332] text-[#FFF0C2] shrink-0">
              <Coins className="w-4.5 h-4.5" />
            </div>
            <div className="text-xs text-[#163327] leading-relaxed">
              <strong className="font-extrabold text-[#1B4332]">Dual-Verification Transparency Policy:</strong>{' '}
              Ang gipakita dinhi mao lamang ang mga transaksyon nga human na <span className="font-bold underline">na-audit sa Auditor</span> ug{' '}
              <span className="font-bold underline">na-aprobahan sa Presidente</span>. Ang mga wala pa masusi o gi-uli alang sa koreksyon dili makita dinhi.
            </div>
          </div>

          {/* SUMMARY KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider">
                <span>Total Approved Income</span>
                <ArrowUpRight className="w-4 h-4 text-emerald-700" />
              </div>
              <p className="text-lg sm:text-xl font-black font-mono text-emerald-800 mt-1.5">
                {formatPhp(summary.totalIncome)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Nasulod nga pondo (Audited &amp; Approved)</p>
            </div>

            <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-rose-800 uppercase tracking-wider">
                <span>Total Approved Expenses</span>
                <ArrowDownRight className="w-4 h-4 text-rose-700" />
              </div>
              <p className="text-lg sm:text-xl font-black font-mono text-rose-800 mt-1.5">
                {formatPhp(summary.totalExpense)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Nagasto nga pondo (Audited &amp; Approved)</p>
            </div>

            <div className="bg-white border border-[#1B4332]/25 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-[#1B4332] uppercase tracking-wider">
                <span>Net Approved Balance</span>
                <Landmark className="w-4 h-4 text-[#1B4332]" />
              </div>
              <p className={`text-lg sm:text-xl font-black font-mono mt-1.5 ${summary.netBalance >= 0 ? 'text-[#1B4332]' : 'text-rose-700'}`}>
                {formatPhp(summary.netBalance)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Approved Income minus Approved Expenses</p>
            </div>

            <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-amber-900 uppercase tracking-wider">
                <span>Verified Entries</span>
                <FileText className="w-4 h-4 text-amber-700" />
              </div>
              <p className="text-lg sm:text-xl font-black font-mono text-[#163327] mt-1.5">
                {summary.count} {summary.count === 1 ? 'Record' : 'Records'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Dual-signed financial transactions</p>
            </div>
          </div>

          {/* FILTER & SEARCH BAR */}
          <div className="bg-white border border-[#E2DDD2] rounded-2xl p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#1B4332] mr-1">
                <Filter className="w-3.5 h-3.5" />
                <span>Filter:</span>
              </span>

              {/* Type pills */}
              {([
                { id: 'ALL' as const, label: 'Tanang Approved (All)' },
                { id: 'income' as const, label: 'Kita (Income)' },
                { id: 'expense' as const, label: 'Gasto (Expenses)' }
              ]).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedType(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${selectedType === tab.id
                      ? 'bg-[#1B4332] text-white shadow-xs'
                      : 'bg-[#F3FAF5] text-[#1B4332] hover:bg-[#D6EFD9]'
                    }`}
                >
                  {tab.label}
                </button>
              ))}

              {/* Year selector */}
              <div className="flex items-center gap-1.5 ml-0 sm:ml-2">
                <Calendar className="w-3.5 h-3.5 text-[#1B4332]" />
                <select
                  aria-label="Filter approved transactions by year"
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  className="bg-[#F3FAF5] border border-[#1B4332]/20 rounded-xl px-2.5 py-1.5 text-xs font-extrabold text-[#1B4332] focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                >
                  <option value="ALL">All Years ({approvedTransactions.length})</option>
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>Year {yr}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Search input */}
            <div className="relative min-w-[220px] sm:min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search category, purpose, fund..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-300 bg-[#FAF8F5] text-xs font-semibold text-[#163327] focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* TRANSACTIONS TABLE */}
          <div className="bg-white border border-[#E2DDD2] rounded-2xl overflow-hidden shadow-xs">
            {filteredTransactions.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[#EAF4EC] text-[#1B4332] flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-extrabold text-[#1B4332]">
                  Walay Nakit-an nga Dual-Approved Financial Transactions
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {approvedTransactions.length === 0
                    ? 'Wala pay transaksyon nga dungan nang na-audit sa Auditor ug na-aprobahan sa Presidente.'
                    : 'Walay transaksyon nga mohaom sa imong gipili nga tuig, klase, o gi-search nga pulong.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#1B4332] text-white text-[11px] font-extrabold uppercase tracking-wider">
                      <th className="py-3 px-3.5">Petsa (Date)</th>
                      <th className="py-3 px-3.5">Klase (Type)</th>
                      <th className="py-3 px-3.5">Kategorya (Category)</th>
                      <th className="py-3 px-3.5">Katuyoan ug Detalye (Purpose &amp; Description)</th>
                      <th className="py-3 px-3.5">Tinubdan sa Pondo (Fund Source)</th>
                      <th className="py-3 px-3.5 text-right">Kantidad (Amount)</th>
                      <th className="py-3 px-3.5">Dual Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredTransactions.map(tx => {
                      const isIncome = tx.type === 'income';
                      const linkedActivity = tx.activityId ? activityById.get(tx.activityId) : undefined;
                      const linkedMeeting = tx.meetingId ? meetingById.get(tx.meetingId) : undefined;

                      return (
                        <tr key={tx.id} className="hover:bg-[#F3FAF5]/70 transition-colors align-top">
                          <td className="py-3.5 px-3.5 font-mono font-bold text-slate-700 whitespace-nowrap">
                            {tx.date}
                          </td>
                          <td className="py-3.5 px-3.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${isIncome
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : 'bg-rose-100 text-rose-900 border border-rose-300'
                                }`}
                            >
                              {isIncome ? (
                                <ArrowUpRight className="w-3 h-3 text-emerald-700" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3 text-rose-700" />
                              )}
                              {isIncome ? 'Kita (Income)' : 'Gasto (Expense)'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5 font-extrabold text-[#1B4332]">
                            {tx.category}
                          </td>
                          <td className="py-3.5 px-3.5 text-slate-700 max-w-md space-y-1">
                            {tx.purpose && tx.purpose !== tx.description && (
                              <p className="font-bold text-[#163327]">
                                Katuyoan: <span className="font-semibold">{tx.purpose}</span>
                              </p>
                            )}
                            <p className="text-slate-600 leading-relaxed">{tx.description}</p>
                            {(linkedActivity || linkedMeeting) && (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {linkedActivity && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-lg">
                                    Kalihokan: {linkedActivity.title}
                                  </span>
                                )}
                                {linkedMeeting && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-sky-50 text-sky-900 border border-sky-300 px-2 py-0.5 rounded-lg">
                                    Tigom: {linkedMeeting.title}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3.5">
                            <span className="inline-block bg-slate-100 text-slate-800 border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-bold">
                              {tx.fundSource || 'Unspecified'}
                            </span>
                          </td>
                          <td
                            className={`py-3.5 px-3.5 text-right font-mono font-black whitespace-nowrap text-sm ${isIncome ? 'text-emerald-800' : 'text-rose-800'
                              }`}
                          >
                            {isIncome ? '+' : '-'}{formatPhp(tx.amount)}
                          </td>
                          <td className="py-3.5 px-3.5 space-y-1 min-w-[190px]">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <div className="truncate">
                                <span className="block leading-tight">Audited: {tx.auditedBy || 'AFA Auditor'}</span>
                                {tx.auditedDate && (
                                  <span className="block text-[10px] text-emerald-700 font-mono">{tx.auditedDate}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1B4332] bg-[#EAF4EC] border border-[#7EC79F] rounded-lg px-2 py-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#1B4332] shrink-0" />
                              <div className="truncate">
                                <span className="block leading-tight">Approved: {tx.presidentApprovedBy || 'AFA President'}</span>
                                {tx.presidentApprovedDate && (
                                  <span className="block text-[10px] text-[#2D6A4F] font-mono">{tx.presidentApprovedDate}</span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="bg-white border-t border-[#E2DDD2] px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <p className="text-[11px] font-semibold text-slate-600">
            Showing <strong>{filteredTransactions.length}</strong> of <strong>{approvedTransactions.length}</strong> dual-approved financial records (Auditor-Audited &amp; President-Approved).
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-extrabold transition-colors cursor-pointer"
          >
            Sirad-an (Close Ledger)
          </button>
        </div>
      </div>
    </div>
  );
}
