import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, AlertTriangle, CheckCircle, FileText, Filter, ShieldCheck, Wallet, Package, Plus, Trash2, Pencil, Boxes } from 'lucide-react';
import { FinancialTransaction, InventoryItem } from '../types';

interface AuditorViewProps {
  transactions: FinancialTransaction[];
  onAuditTransaction: (id: string, status: 'Audited' | 'Flagged', notes: string) => void;
  onOpenReportModal?: () => void;
  inventory?: InventoryItem[];
  onAddInventory?: (item: Omit<InventoryItem, 'id' | 'dateRecorded' | 'lastUpdated'>) => void;
  onUpdateInventory?: (item: InventoryItem) => void;
  onDeleteInventory?: (id: string) => void;
  auditorName?: string;
}

export default function AuditorView({
  transactions,
  onAuditTransaction,
  onOpenReportModal,
  inventory = [],
  onAddInventory,
  onUpdateInventory,
  onDeleteInventory,
  auditorName = 'Auditor (Lorena B. Pinote)'
}: AuditorViewProps) {
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterAudit, setFilterAudit] = useState<'all' | 'Unaudited' | 'Audited' | 'Flagged'>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransaction | null>(null);
  const [auditStatus, setAuditStatus] = useState<'Audited' | 'Flagged'>('Audited');
  const [auditNotes, setAuditNotes] = useState('');

  // Inventory registry state (custodial duty of the Auditor — no Property Custodian exists)
  const [inventoryTab, setInventoryTab] = useState<'audit' | 'inventory'>('audit');
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState<InventoryItem | null>(null);
  const [invName, setInvName] = useState('');
  const [invCategory, setInvCategory] = useState<InventoryItem['category']>('IGP Equipment');
  const [invQuantity, setInvQuantity] = useState(1);
  const [invUnit, setInvUnit] = useState('pieces');
  const [invCondition, setInvCondition] = useState<InventoryItem['condition']>('Good');
  const [invLocation, setInvLocation] = useState('');
  const [invNotes, setInvNotes] = useState('');

  const unauditedCount = transactions.filter(transaction => transaction.auditedStatus === 'Unaudited').length;
  const auditedCount = transactions.filter(transaction => transaction.auditedStatus === 'Audited').length;
  const flaggedCount = transactions.filter(transaction => transaction.auditedStatus === 'Flagged').length;
  const filteredTransactions = transactions.filter(transaction =>
    (filterType === 'all' || transaction.type === filterType) &&
    (filterAudit === 'all' || transaction.auditedStatus === filterAudit)
  );

  const openAudit = (transaction: FinancialTransaction, status: 'Audited' | 'Flagged') => {
    setSelectedTransaction(transaction);
    setAuditStatus(status);
    setAuditNotes('');
  };

  const openAddInventory = () => {
    setEditingInventoryItem(null);
    setInvName('');
    setInvCategory('IGP Equipment');
    setInvQuantity(1);
    setInvUnit('pieces');
    setInvCondition('Good');
    setInvLocation('');
    setInvNotes('');
    setShowInventoryModal(true);
  };

  const openEditInventory = (item: InventoryItem) => {
    setEditingInventoryItem(item);
    setInvName(item.name);
    setInvCategory(item.category);
    setInvQuantity(item.quantity);
    setInvUnit(item.unit);
    setInvCondition(item.condition as InventoryItem['condition']);
    setInvLocation(item.location || '');
    setInvNotes(item.notes || '');
    setShowInventoryModal(true);
  };

  const handleSaveInventory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invName.trim()) return;
    if (editingInventoryItem) {
      onUpdateInventory?.({
        ...editingInventoryItem,
        name: invName.trim(),
        category: invCategory,
        quantity: Math.max(0, Number(invQuantity)),
        unit: invUnit.trim() || 'pieces',
        condition: invCondition,
        location: invLocation.trim() || undefined,
        notes: invNotes.trim() || undefined,
        lastUpdated: new Date().toISOString().split('T')[0]
      });
    } else {
      onAddInventory?.({
        name: invName.trim(),
        category: invCategory,
        quantity: Math.max(0, Number(invQuantity)),
        unit: invUnit.trim() || 'pieces',
        condition: invCondition,
        location: invLocation.trim() || undefined,
        notes: invNotes.trim() || undefined,
        recordedBy: auditorName
      });
    }
    setShowInventoryModal(false);
  };

  const inventoryNeedsAttention = inventory.filter(i => i.condition === 'Needs Repair' || i.condition === 'Damaged' || i.condition === 'Lost').length;

  const submitAudit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTransaction) return;
    onAuditTransaction(selectedTransaction.id, auditStatus, auditNotes.trim() || 'No audit comments.');
    setSelectedTransaction(null);
  };

  return (
    <div id="auditor-view-container" className="space-y-6">
      {/* MODULE TABS: Financial Audit vs Inventory Registry (Auditor is the custodian of inventory notes) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D5CFC1] pb-3">
        <div className="flex space-x-4">
          <button
            onClick={() => setInventoryTab('audit')}
            className={`flex items-center gap-2 border-b-2 pb-2.5 text-sm font-bold transition-all cursor-pointer ${
              inventoryTab === 'audit'
                ? 'border-[#1B4332] text-[#1B4332]'
                : 'border-transparent text-[#6A7F72] hover:text-[#1B4332]'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Financial Audit ({transactions.length})</span>
          </button>
          <button
            onClick={() => setInventoryTab('inventory')}
            className={`flex items-center gap-2 border-b-2 pb-2.5 text-sm font-bold transition-all cursor-pointer ${
              inventoryTab === 'inventory'
                ? 'border-[#2D6A4F] text-[#2D6A4F]'
                : 'border-transparent text-[#6A7F72] hover:text-[#1B4332]'
            }`}
          >
            <Boxes className="h-4 w-4" />
            <span>Inventory Registry ({inventory.length})</span>
          </button>
        </div>

        {inventoryTab === 'inventory' && (
          <button
            type="button"
            onClick={openAddInventory}
            className="flex items-center gap-1.5 rounded-xl bg-[#1B4332] px-4 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-[#143326] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Record Inventory Item</span>
          </button>
        )}
      </div>

      {inventoryTab === 'inventory' ? (
        <section className="space-y-4" aria-label="Association inventory registry">
          <div className="rounded-2xl border border-[#B7D9BF] bg-[#EAF4EC] p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-emerald-700/15 bg-white p-2.5">
                <Package className="h-5 w-5 text-emerald-800" />
              </div>
              <div>
                <h2 className="text-lg font-black text-[#1B4332]">Association Inventory & Custodial Notes</h2>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[#D5CFC1] bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-[#4A5F57]">Total Items</p>
                <p className="text-lg font-black text-[#1B4332]">{inventory.length}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-bold uppercase text-emerald-800">Good Condition</p>
                <p className="text-lg font-black text-emerald-900">{inventory.filter(i => i.condition === 'Good').length}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-bold uppercase text-amber-800">Needs Repair</p>
                <p className="text-lg font-black text-amber-900">{inventory.filter(i => i.condition === 'Needs Repair').length}</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-[10px] font-bold uppercase text-rose-800">Damaged / Lost</p>
                <p className="text-lg font-black text-rose-900">{inventory.filter(i => i.condition === 'Damaged' || i.condition === 'Lost').length}</p>
              </div>
            </div>
          </div>

          {inventory.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {inventory.map(item => (
                <article
                  key={item.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    item.condition === 'Damaged' || item.condition === 'Lost'
                      ? 'border-rose-300'
                      : item.condition === 'Needs Repair'
                        ? 'border-amber-300'
                        : 'border-[#D5CFC1]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="rounded-lg border border-[#D5CFC1] bg-[#F7F4EF] px-2 py-0.5 text-[10px] font-bold uppercase text-[#4A5F57]">{item.category}</span>
                      <h3 className="mt-1 break-words text-sm font-black text-[#1B4332]">{item.name}</h3>
                      <p className="font-mono text-xs text-[#4A5F57]">{item.quantity} {item.unit}</p>
                      {item.location && <p className="mt-0.5 text-[10px] text-[#4A5F57]">Location: {item.location}</p>}
                    </div>
                    <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${
                      item.condition === 'Good'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                        : item.condition === 'Needs Repair'
                          ? 'border border-amber-200 bg-amber-50 text-amber-800'
                          : 'border border-rose-200 bg-rose-50 text-rose-800'
                    }`}>
                      {item.condition}
                    </span>
                  </div>
                  {item.notes && (
                    <div className="mt-2.5 rounded-xl border border-[#D5CFC1] bg-[#F7F4EF] p-2.5">
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-700">
                        <FileText className="h-3 w-3" />
                        Auditor's Custodial Notes:
                      </span>
                      <p className="mt-1 break-words text-xs italic text-[#33473D]">{item.notes}</p>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-[#E9E4D9] pt-2.5">
                    <span className="font-mono text-[10px] text-[#4A5F57]">By: {item.recordedBy} • Updated: {item.lastUpdated}</span>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => openEditInventory(item)} className="rounded-lg bg-[#F5FAF6] p-1.5 text-[#4B6259] transition-all hover:text-[#1B4332] cursor-pointer" title="Edit inventory item">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => { if (confirm(`Sigurado ka nga gusto nimong idelete ang inventory item "${item.name}"?`)) onDeleteInventory?.(item.id); }} className="rounded-lg bg-rose-500/10 p-1.5 text-rose-600 transition-all hover:bg-rose-500/20 cursor-pointer" title="Delete inventory item">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#D5CFC1] bg-white p-8 text-center text-sm text-[#4A5F57]">
              No inventory items recorded yet. Use "Record Inventory Item" to start the association's official inventory registry.
            </div>
          )}
        </section>
      ) : (
      <>
      <section className="space-y-4" aria-label="Auditor dashboard">
        <div className="flex flex-col gap-4 rounded-2xl border border-bafa-neutral-300 bg-[#F7F4EF] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-emerald-700/15 bg-emerald-700/10 p-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-800" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#1B4332]">Auditor Review Desk</h2>
              <p className="mt-1 text-sm text-[#4A5F57]">Review transaction records, verify entries, and flag discrepancies.</p>
            </div>
          </div>
          {onOpenReportModal && (
            <button
              id="auditor-report-btn"
              type="button"
              onClick={onOpenReportModal}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-700/25 bg-white px-4 py-2.5 text-sm font-bold text-[#1B4332] transition-colors hover:bg-[#EAF6EE] sm:w-auto"
            >
              <FileText className="h-4 w-4" />
              <span>Export Auditor Report</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-bafa-neutral-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-[#4A5F57]">Transaction Records</p>
            <p className="mt-1 text-2xl font-black text-[#1B4332]">{transactions.length}</p>
            <p className="mt-1 text-xs text-[#4A5F57]">All ledger entries</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase text-amber-800">Awaiting Review</p>
            <p className="mt-1 text-2xl font-black text-amber-900">{unauditedCount}</p>
            <p className="mt-1 text-xs text-amber-800">Unaudited entries</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-800">Verified</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{auditedCount}</p>
            <p className="mt-1 text-xs text-emerald-800">Approved entries</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase text-rose-800">Flagged</p>
            <p className="mt-1 text-2xl font-black text-rose-900">{flaggedCount}</p>
            <p className="mt-1 text-xs text-rose-800">Requiring follow-up</p>
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-label="Transaction audit queue">
        <div className="flex flex-col gap-3 rounded-xl border border-bafa-neutral-300 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#4A5F57]">
            <Filter className="h-3.5 w-3.5" />
            <span>Audit Queue</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter transactions by type"
              value={filterType}
              onChange={event => setFilterType(event.target.value as typeof filterType)}
              className="rounded-lg border border-bafa-neutral-300 bg-white px-3 py-1.5 text-xs text-[#1B4332] focus:border-emerald-600 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expenses Only</option>
            </select>
            <select
              aria-label="Filter transactions by audit status"
              value={filterAudit}
              onChange={event => setFilterAudit(event.target.value as typeof filterAudit)}
              className="rounded-lg border border-bafa-neutral-300 bg-white px-3 py-1.5 text-xs text-[#1B4332] focus:border-emerald-600 focus:outline-none"
            >
              <option value="all">All Audit Statuses</option>
              <option value="Unaudited">Unaudited</option>
              <option value="Audited">Audited</option>
              <option value="Flagged">Flagged / Action Required</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredTransactions.length ? filteredTransactions.map(transaction => (
            <article
              key={transaction.id}
              className={`flex flex-col justify-between gap-4 rounded-2xl border bg-white p-4 shadow-sm md:flex-row ${
                transaction.auditedStatus === 'Flagged'
                  ? 'border-rose-300'
                  : transaction.auditedStatus === 'Audited'
                    ? 'border-emerald-200'
                    : 'border-bafa-neutral-300'
              }`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className={`shrink-0 rounded-xl border p-2.5 ${
                  transaction.type === 'income'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}>
                  {transaction.type === 'income' ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-bafa-neutral-300 bg-[#F7F4EF] px-2 py-0.5 text-xs font-semibold text-[#4A5F57]">{transaction.category}</span>
                    <span className="font-mono text-xs text-[#4A5F57]">{transaction.date}</span>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      <Wallet className="h-3 w-3" />
                      {transaction.type === 'income' ? 'Deposited to: ' : 'Budget source: '}
                      {transaction.fundSource || 'General Operational Fund'}
                    </span>
                  </div>
                  <p className="mt-1.5 break-words text-sm font-semibold text-[#1B4332]">{transaction.description}</p>
                  <p className="mt-1 text-[10px] text-[#4A5F57]">Logged by: {transaction.recordedBy}</p>
                  {transaction.auditedStatus !== 'Unaudited' && (
                    <div className={`mt-3 rounded-xl border p-2.5 text-xs ${
                      transaction.auditedStatus === 'Flagged'
                        ? 'border-rose-200 bg-rose-50'
                        : 'border-emerald-200 bg-emerald-50'
                    }`}>
                      <div className="mb-0.5 flex items-center gap-1.5 font-bold">
                        {transaction.auditedStatus === 'Flagged'
                          ? <AlertTriangle className="h-3.5 w-3.5 text-rose-700" />
                          : <CheckCircle className="h-3.5 w-3.5 text-emerald-700" />}
                        <span>{transaction.auditedStatus === 'Flagged' ? 'Flagged for follow-up' : 'Audited and approved'}</span>
                      </div>
                      <p className="break-words leading-relaxed text-[#33473d]">{transaction.auditNotes || 'No audit comments.'}</p>
                      <p className="mt-1 font-mono text-[9px] text-[#4A5F57]">By: {transaction.auditedBy} on {transaction.auditedDate}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-bafa-neutral-300 pt-3 md:flex-col md:items-end md:border-t-0 md:pt-0">
                <p className={`font-mono text-lg font-bold ${transaction.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {transaction.type === 'income' ? '+' : '-'} PHP {transaction.amount.toLocaleString()}
                </p>
                {transaction.auditedStatus === 'Unaudited' ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => openAudit(transaction, 'Flagged')} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100">
                      <AlertTriangle className="h-3 w-3" /><span>Flag</span>
                    </button>
                    <button type="button" onClick={() => openAudit(transaction, 'Audited')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100">
                      <ShieldCheck className="h-3 w-3" /><span>Approve</span>
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => openAudit(transaction, transaction.auditedStatus === 'Audited' ? 'Audited' : 'Flagged')} className="text-[10px] font-medium text-[#4A5F57] underline hover:text-[#1B4332]">
                    Re-evaluate Audit
                  </button>
                )}
              </div>
            </article>
          )) : (
            <div className="rounded-2xl border border-bafa-neutral-300 bg-white p-8 text-center text-sm text-[#4A5F57]">
              {transactions.length ? 'No transactions match the selected filters.' : 'No transactions are available for review.'}
            </div>
          )}
        </div>
      </section>
      </>
      )}

      {/* ADD / EDIT INVENTORY ITEM MODAL */}
      {showInventoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#D5CFC1] bg-[#F7F4EF] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#D5CFC1] bg-[#EAF4EC] px-5 py-4">
              <h2 className="text-base font-bold text-[#1B4332]">{editingInventoryItem ? 'Edit Inventory Item & Notes' : 'Record Inventory Item & Notes'}</h2>
              <button type="button" onClick={() => setShowInventoryModal(false)} className="text-xl font-bold text-[#4A5F57] hover:text-[#1B4332]" aria-label="Close inventory dialog">&times;</button>
            </div>
            <form onSubmit={handleSaveInventory} className="space-y-3.5 p-5">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Item Name</label>
                <input type="text" required value={invName} onChange={e => setInvName(e.target.value)} placeholder="e.g. IGP Plastic Chairs, Harvest Sacks, Knapsack Sprayer" className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Category</label>
                  <select value={invCategory} onChange={e => setInvCategory(e.target.value as InventoryItem['category'])} className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none">
                    <option value="IGP Equipment">IGP Equipment</option>
                    <option value="Farm Tools">Farm Tools</option>
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Rental Assets">Rental Assets</option>
                    <option value="Livestock">Livestock</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Condition</label>
                  <select value={invCondition} onChange={e => setInvCondition(e.target.value as InventoryItem['condition'])} className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none">
                    <option value="Good">Good</option>
                    <option value="Needs Repair">Needs Repair</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Quantity</label>
                  <input type="number" min={0} required value={invQuantity} onChange={e => setInvQuantity(Number(e.target.value))} className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 font-mono text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Unit</label>
                  <input type="text" required value={invUnit} onChange={e => setInvUnit(e.target.value)} placeholder="e.g. pieces, sacks, units" className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Storage Location (Optional)</label>
                <input type="text" value={invLocation} onChange={e => setInvLocation(e.target.value)} placeholder="e.g. Barangay Alegria Covered Court Storage" className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Custodial / Inventory Notes (Optional)</label>
                <textarea rows={3} value={invNotes} onChange={e => setInvNotes(e.target.value)} placeholder="e.g. Counted 120 pieces during quarterly physical inventory; 8 chairs returned broken by renters." className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowInventoryModal(false)} className="flex-1 rounded-xl border border-[#D5CFC1] px-3 py-2.5 text-sm font-semibold text-[#1B4332] hover:bg-[#EAF4EE]">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Save Inventory Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* AUDIT VERDICT MODAL */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="auditor-modal-title" className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-bafa-neutral-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-bafa-neutral-300 bg-[#F7F4EF] px-5 py-4">
              <h2 id="auditor-modal-title" className="text-base font-bold text-[#1B4332]">Conduct Financial Audit</h2>
              <button type="button" onClick={() => setSelectedTransaction(null)} className="p-1 text-xl font-bold text-[#4A5F57] hover:text-[#1B4332]" aria-label="Close audit dialog">&times;</button>
            </div>
            <form onSubmit={submitAudit} className="space-y-4 p-5">
              <div>
                <span className="mb-2 block text-xs font-bold uppercase text-[#4A5F57]">Audit Verdict</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setAuditStatus('Audited')} aria-pressed={auditStatus === 'Audited'} className={`rounded-lg border px-3 py-2 text-xs font-bold ${auditStatus === 'Audited' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-bafa-neutral-300 bg-white text-[#1B4332]'}`}>
                    Verify &amp; Approve
                  </button>
                  <button type="button" onClick={() => setAuditStatus('Flagged')} aria-pressed={auditStatus === 'Flagged'} className={`rounded-lg border px-3 py-2 text-xs font-bold ${auditStatus === 'Flagged' ? 'border-rose-700 bg-rose-700 text-white' : 'border-bafa-neutral-300 bg-white text-[#1B4332]'}`}>
                    Flag / Action Required
                  </button>
                </div>
              </div>
              <label className="block text-xs font-bold uppercase text-[#4A5F57]">
                Audit Comments
                <textarea
                  rows={4}
                  required
                  value={auditNotes}
                  onChange={event => setAuditNotes(event.target.value)}
                  placeholder={auditStatus === 'Audited' ? 'Describe how the entry was verified.' : 'Describe the discrepancy and required follow-up.'}
                  className="mt-1 block w-full rounded-xl border border-bafa-neutral-300 bg-white px-3.5 py-2.5 text-sm font-normal normal-case text-[#1B4332] focus:border-emerald-600 focus:outline-none"
                />
              </label>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setSelectedTransaction(null)} className="flex-1 rounded-xl border border-bafa-neutral-300 px-3 py-2.5 text-sm font-semibold text-[#1B4332] hover:bg-[#F7F4EF]">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Submit Audit Decision</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}