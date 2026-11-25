import React, { useMemo, useState } from 'react';
import { FinancialTransaction, AssociationActivity, Meeting } from '../types';
import {
  ShieldCheck, CheckCircle, X, Search, Printer,
  ArrowUpRight, ArrowDownRight, Calendar, Landmark, FileText, Coins, Filter
} from 'lucide-react';
import { escapeHtml, triggerPrintWindow } from '../utils/htmlEscape';

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

  const handlePrintApprovedLedger = () => {
    const yearLabel = selectedYear === 'ALL' ? 'All Recorded Years' : `Calendar Year ${selectedYear}`;
    const typeLabel =
      selectedType === 'ALL'
        ? 'All Approved Income & Expenses'
        : selectedType === 'income'
          ? 'Approved Income Only'
          : 'Approved Expenses Only';

    const rowsHtml = filteredTransactions.length === 0
      ? `<tr><td colspan="7" style="text-align:center;padding:18px;color:#64748b;">No dual-approved financial transactions match the selected filters.</td></tr>`
      : filteredTransactions
          .map((tx, idx) => {
            const linkedAct = tx.activityId ? activityById.get(tx.activityId)?.title : '';
            const linkedMtg = tx.meetingId ? meetingById.get(tx.meetingId)?.title : '';
            const detailParts = [
              tx.purpose && tx.purpose !== tx.description ? `Purpose: ${tx.purpose}` : '',
              tx.description || '',
              linkedAct ? `Activity: ${linkedAct}` : '',
              linkedMtg ? `Meeting: ${linkedMtg}` : ''
            ].filter(Boolean);

            return `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="white-space:nowrap;font-family:monospace;">${escapeHtml(tx.date || '—')}</td>
                <td>
                  <span style="font-weight:700;text-transform:uppercase;color:${tx.type === 'income' ? '#166534' : '#991b1b'};">
                    ${escapeHtml(tx.type === 'income' ? 'INCOME' : 'EXPENSE')}
                  </span>
                </td>
                <td style="font-weight:700;">${escapeHtml(tx.category || '—')}</td>
                <td>${escapeHtml(detailParts.join(' • ') || '—')}</td>
                <td>${escapeHtml(tx.fundSource || 'Unspecified')}</td>
                <td style="text-align:right;white-space:nowrap;font-family:monospace;font-weight:700;color:${tx.type === 'income' ? '#166534' : '#991b1b'};">
                  ${tx.type === 'income' ? '+' : '-'}${escapeHtml(formatPhp(tx.amount))}
                </td>
              </tr>
            `;
          })
          .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Approved Financial Transactions Ledger — Alegria Farmers Association</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #0f172a; margin: 24px; }
    .header { text-align: center; border-bottom: 2px solid #1B4332; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 18px; text-transform: uppercase; color: #1B4332; }
    .header p { margin: 3px 0; font-size: 12px; color: #334155; }
    .badge { display: inline-block; margin-top: 6px; padding: 3px 10px; font-size: 11px; font-weight: bold; background: #EAF4EC; color: #1B4332; border: 1px solid #1B4332; border-radius: 999px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; font-family: Arial, sans-serif; }
    .kpi-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc; }
    .kpi-label { font-size: 10px; text-transform: uppercase; color: #475569; font-weight: bold; }
    .kpi-value { font-size: 14px; font-weight: bold; margin-top: 4px; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { background: #1B4332; color: #ffffff; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
    tr:nth-child(even) { background: #f8fafc; }
    .footer { margin-top: 18px; font-size: 11px; color: #475569; display: flex; justify-content: space-between; font-family: Arial, sans-serif; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Alegria Farmers Association (AFA)</h1>
    <p>Barangay Alegria, Tuburan, Cebu • DOLE Registration No. 2315</p>
    <div class="badge">AUDITOR-VERIFIED &amp; PRESIDENT-APPROVED FINANCIAL TRANSPARENCY LEDGER</div>
    <p style="margin-top:6px;">Filter Scope: <strong>${escapeHtml(yearLabel)}</strong> • <strong>${escapeHtml(typeLabel)}</strong></p>
  </div>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Approved Income</div>
      <div class="kpi-value" style="color:#166534;">${escapeHtml(formatPhp(summary.totalIncome))}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Approved Expenses</div>
      <div class="kpi-value" style="color:#991b1b;">${escapeHtml(formatPhp(summary.totalExpense))}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Net Approved Balance</div>
      <div class="kpi-value" style="color:${summary.netBalance >= 0 ? '#1B4332' : '#991b1b'};">${escapeHtml(formatPhp(summary.netBalance))}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Verified Entries</div>
      <div class="kpi-value">${summary.count} Record(s)</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:32px;text-align:center;">#</th>
        <th style="width:86px;">Date</th>
        <th style="width:76px;">Type</th>
        <th style="width:140px;">Category</th>
        <th>Purpose &amp; Description</th>
        <th style="width:130px;">Fund Source</th>
        <th style="width:120px;text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="footer">
    <span>Dual-Control Verification: Every listed transaction is Audited by the AFA Auditor and Approved by the AFA President.</span>
    <span>Printed on ${escapeHtml(new Date().toLocaleDateString('en-PH'))}</span>
  </div>
</body>
</html>`;

    const printWin = window.open('', '_blank', 'width=960,height=720');
    if (!printWin) return;
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    triggerPrintWindow(printWin);
  };

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
              onClick={handlePrintApprovedLedger}
              className="hidden sm:inline-flex items-center gap-1.5 bg-[#2D6A4F] hover:bg-[#40916C] text-white border border-[#7EC79F]/40 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer"
              title="Print Approved Financial Ledger"
            >
              <Printer className="w-4 h-4" />
              <span>Print Ledger</span>
            </button>
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
          <div className="bg-[#EAF4EC] border border-[#7EC79F] rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 rounded-xl bg-[#1B4332] text-[#FFF0C2] shrink-0">
                <Coins className="w-4.5 h-4.5" />
              </div>
              <div className="text-xs text-[#163327] leading-relaxed">
                <strong className="font-extrabold text-[#1B4332]">Dual-Verification Transparency Policy:</strong>{' '}
                Ang gipakita dinhi mao lamang ang mga transaksyon nga human na <span className="font-bold underline">na-audit sa Auditor</span> ug{' '}
                <span className="font-bold underline">na-aprobahan sa Presidente</span>. Ang mga wala pa masusi o gi-uli alang sa koreksyon dili makita dinhi.
              </div>
            </div>
            <button
              type="button"
              onClick={handlePrintApprovedLedger}
              className="sm:hidden inline-flex items-center justify-center gap-1.5 bg-[#1B4332] text-white px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer shrink-0"
            >
              <Printer className="w-4 h-4" />
              <span>Print Approved Ledger</span>
            </button>
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    selectedType === tab.id
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
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                isIncome
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
                            className={`py-3.5 px-3.5 text-right font-mono font-black whitespace-nowrap text-sm ${
                              isIncome ? 'text-emerald-800' : 'text-rose-800'
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
