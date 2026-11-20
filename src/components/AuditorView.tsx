import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, AlertTriangle, CheckCircle, FileText, Filter, ShieldCheck, Wallet, Package, Plus, Trash2, Pencil, Boxes, Minus, Search, Wrench, ShoppingBag } from 'lucide-react';
import { FinancialTransaction, LivestockIgpState, InventoryItem, Product } from '../types';
import { getAvailableEggCount } from '../utils/eggInventory';
import { getAvailableInventoryQuantity, getInventoryConditionForCounts, getInventoryDamagedQuantity, getRentalStockStatus } from '../utils/inventory';

interface AuditorViewProps {
  transactions: FinancialTransaction[];
  livestockIgp: LivestockIgpState;
  onAuditTransaction: (id: string, status: 'Audited' | 'Flagged', notes: string) => void;
  onOpenReportModal?: () => void;
  inventory?: InventoryItem[];
  products?: Product[];
  onAddInventory?: (item: Omit<InventoryItem, 'id' | 'dateRecorded' | 'lastUpdated'>) => void;
  onUpdateInventory?: (item: InventoryItem) => void;
  onDeleteInventory?: (id: string) => void;
  onPublishRentalProduct?: (item: InventoryItem, listing: { price: number; unit: string; description: string }) => void;
  auditorName?: string;
}

export default function AuditorView({
  transactions,
  livestockIgp,
  onAuditTransaction,
  onOpenReportModal,
  inventory = [],
  products = [],
  onAddInventory,
  onUpdateInventory,
  onDeleteInventory,
  onPublishRentalProduct,
  auditorName = 'AFA Auditor'
}: AuditorViewProps) {
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterAudit, setFilterAudit] = useState<'all' | 'Unaudited' | 'Audited' | 'Flagged'>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransaction | null>(null);
  const [auditStatus, setAuditStatus] = useState<'Audited' | 'Flagged'>('Audited');
  const [auditNotes, setAuditNotes] = useState('');

  // Inventory registry state (custodial duty of the Auditor — no Property Custodian exists)
  const [inventoryTab, setInventoryTab] = useState<'audit' | 'inventory' | 'eggs'>('audit');
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState<InventoryItem | null>(null);
  const [invName, setInvName] = useState('');
  const [invCategory, setInvCategory] = useState<InventoryItem['category']>('IGP Equipment');
  const [invQuantity, setInvQuantity] = useState(1);
  const [invUnit, setInvUnit] = useState('pieces');
  const [invCondition, setInvCondition] = useState<InventoryItem['condition']>('Good');
  const [invDamagedQuantity, setInvDamagedQuantity] = useState(0);
  const [invLocation, setInvLocation] = useState('');
  const [invNotes, setInvNotes] = useState('');
  const [inventoryError, setInventoryError] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('All');
  const [inventoryConditionFilter, setInventoryConditionFilter] = useState('All');
  const [rentalListingItem, setRentalListingItem] = useState<InventoryItem | null>(null);
  const [rentalPrice, setRentalPrice] = useState(0);
  const [rentalUnit, setRentalUnit] = useState('per day');
  const [rentalDescription, setRentalDescription] = useState('');

  const unauditedCount = transactions.filter(transaction => transaction.auditedStatus === 'Unaudited').length;
  const auditedCount = transactions.filter(transaction => transaction.auditedStatus === 'Audited').length;
  const flaggedCount = transactions.filter(transaction => transaction.auditedStatus === 'Flagged').length;
  const filteredTransactions = transactions.filter(transaction =>
    (filterType === 'all' || transaction.type === filterType) &&
    (filterAudit === 'all' || transaction.auditedStatus === filterAudit)
  );
  const [visibleTransactionCount, setVisibleTransactionCount] = useState(10);
  const visibleTransactions = filteredTransactions.slice(0, visibleTransactionCount);

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
    setInvDamagedQuantity(0);
    setInvUnit('pieces');
    setInvCondition('Good');
    setInvLocation('');
    setInvNotes('');
    setInventoryError('');
    setShowInventoryModal(true);
  };

  const openEditInventory = (item: InventoryItem) => {
    setEditingInventoryItem(item);
    setInvName(item.name);
    setInvCategory(item.category);
    setInvQuantity(item.quantity);
    setInvDamagedQuantity(getInventoryDamagedQuantity(item));
    setInvUnit(item.unit);
    setInvCondition(item.condition as InventoryItem['condition']);
    setInvLocation(item.location || '');
    setInvNotes(item.notes || '');
    setInventoryError('');
    setShowInventoryModal(true);
  };

  const handleSaveInventory = (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = Number(invQuantity);
    const damagedQuantity = Number(invDamagedQuantity);
    if (!invName.trim()) return;
    if (!Number.isInteger(quantity) || quantity < 0
      || !Number.isInteger(damagedQuantity) || damagedQuantity < 0
      || damagedQuantity > quantity) {
      setInventoryError('Enter whole-number counts. Damaged quantity cannot exceed the total quantity.');
      return;
    }
    const condition = invCondition === 'Lost'
      ? 'Lost'
      : getInventoryConditionForCounts(quantity, damagedQuantity);
    if (editingInventoryItem) {
      onUpdateInventory?.({
        ...editingInventoryItem,
        name: invName.trim(),
        category: invCategory,
        quantity,
        damagedQuantity,
        unit: invUnit.trim() || 'pieces',
        condition,
        location: invLocation.trim() || undefined,
        notes: invNotes.trim() || undefined,
        lastUpdated: new Date().toISOString().split('T')[0]
      });
    } else {
      onAddInventory?.({
        name: invName.trim(),
        category: invCategory,
        quantity,
        damagedQuantity,
        unit: invUnit.trim() || 'pieces',
        condition,
        location: invLocation.trim() || undefined,
        notes: invNotes.trim() || undefined,
        recordedBy: auditorName
      });
    }
    setShowInventoryModal(false);
  };

  const filteredInventory = inventory.filter(item => {
    const search = inventorySearch.trim().toLowerCase();
    const matchesSearch = !search || [item.name, item.category, item.location || '', item.notes || '']
      .some(value => value.toLowerCase().includes(search));
    const matchesCategory = inventoryCategoryFilter === 'All' || item.category === inventoryCategoryFilter;
    const matchesCondition = inventoryConditionFilter === 'All'
      || (inventoryConditionFilter === 'Available' ? getAvailableInventoryQuantity(item) > 0 : item.condition === inventoryConditionFilter);
    return matchesSearch && matchesCategory && matchesCondition;
  });
  const inventoryUnits = inventory.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.quantity) || 0)), 0);
  const damagedUnits = inventory.reduce((sum, item) => sum + getInventoryDamagedQuantity(item), 0);
  const availableUnits = inventory.reduce((sum, item) => sum + getAvailableInventoryQuantity(item), 0);
  const inventoryCategories = [...new Set(inventory.map(item => item.category))].sort();

  const saveInventoryCounts = (item: InventoryItem, quantity: number, damagedQuantity: number) => {
    onUpdateInventory?.({
      ...item,
      quantity,
      damagedQuantity,
      condition: item.condition === 'Lost' ? 'Lost' : getInventoryConditionForCounts(quantity, damagedQuantity),
      lastUpdated: new Date().toISOString().split('T')[0]
    });
  };

  const openRentalListing = (item: InventoryItem) => {
    setRentalListingItem(item);
    setRentalPrice(0);
    setRentalUnit('per day');
    setRentalDescription(`${item.name} available for rent through the Alegria Farmers Association.`);
  };

  const saveRentalListing = (event: React.FormEvent) => {
    event.preventDefault();
    if (!rentalListingItem || !onPublishRentalProduct || !rentalUnit.trim() || !rentalDescription.trim()) return;
    onPublishRentalProduct(rentalListingItem, {
      price: Math.max(0, Number(rentalPrice)),
      unit: rentalUnit.trim(),
      description: rentalDescription.trim()
    });
    setRentalListingItem(null);
  };
  const availableEggCount = getAvailableEggCount(
    livestockIgp.eggHarvests || [],
    livestockIgp.sales || [],
    'Poultry Raising (RTL)'
  );

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
          <button
            onClick={() => setInventoryTab('eggs')}
            className={`flex items-center gap-2 border-b-2 pb-2.5 text-sm font-bold transition-all cursor-pointer ${
              inventoryTab === 'eggs'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-[#6A7F72] hover:text-[#1B4332]'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>Egg Inventory ({availableEggCount})</span>
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

      {inventoryTab === 'eggs' ? (
        <section className="space-y-4" aria-label="Live egg inventory">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-amber-200 bg-white p-2.5">
                <Package className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <h2 className="text-lg font-black text-[#1B4332]">Live Egg Inventory</h2>
                <p className="text-sm text-[#4A5F57]">Verified harvests less eggs sold</p>
              </div>
            </div>
            <p className="mt-5 text-4xl font-black text-amber-900" aria-live="polite">
              {availableEggCount} <span className="text-base font-bold">eggs available</span>
            </p>
            <p className="mt-2 text-xs text-[#4A5F57]">
              Only audited or President-signed harvests count toward available stock. Egg sales are deducted automatically.
            </p>
          </div>
        </section>
      ) : inventoryTab === 'inventory' ? (
        <section className="space-y-4" aria-label="Association inventory registry">
          <div className="rounded-2xl border border-[#B7D9BF] bg-[#EAF4EC] p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-emerald-700/15 bg-white p-2.5">
                <Package className="h-5 w-5 text-emerald-800" />
              </div>
              <div>
                <h2 className="text-lg font-black text-[#1B4332]">Association Inventory & Custodial Notes</h2>
                <p className="text-sm text-[#4A5F57]">Track counts, damaged units, storage, and rental listings.</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[#D5CFC1] bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-[#4A5F57]">Asset Types</p>
                <p className="text-lg font-black text-[#1B4332]">{inventory.length}</p>
              </div>
              <div className="rounded-xl border border-[#D5CFC1] bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-[#4A5F57]">Total Units</p>
                <p className="text-lg font-black text-[#1B4332]">{inventoryUnits}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-bold uppercase text-amber-800">Available Units</p>
                <p className="text-lg font-black text-amber-900">{availableUnits}</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-[10px] font-bold uppercase text-rose-800">Damaged Units</p>
                <p className="text-lg font-black text-rose-900">{damagedUnits}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-[#D5CFC1] bg-white p-3 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6A7F72]" />
              <input
                type="search"
                value={inventorySearch}
                onChange={event => setInventorySearch(event.target.value)}
                placeholder="Search inventory name, category, location, or notes"
                aria-label="Search inventory"
                className="w-full rounded-lg border border-[#D5CFC1] bg-white py-2 pl-9 pr-3 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none"
              />
            </label>
            <select
              value={inventoryCategoryFilter}
              onChange={event => setInventoryCategoryFilter(event.target.value)}
              aria-label="Filter inventory by category"
              className="rounded-lg border border-[#D5CFC1] bg-white px-3 py-2 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none"
            >
              <option value="All">All categories</option>
              {inventoryCategories.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <select
              value={inventoryConditionFilter}
              onChange={event => setInventoryConditionFilter(event.target.value)}
              aria-label="Filter inventory by condition"
              className="rounded-lg border border-[#D5CFC1] bg-white px-3 py-2 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none"
            >
              <option value="All">All conditions</option>
              <option value="Available">Available</option>
              <option value="Good">Good</option>
              <option value="Needs Repair">Needs Repair</option>
              <option value="Damaged">Damaged</option>
              <option value="Lost">Lost</option>
            </select>
          </div>

          {filteredInventory.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredInventory.map(item => {
                const damagedQuantity = getInventoryDamagedQuantity(item);
                const availableQuantity = getAvailableInventoryQuantity(item);
                const catalogProduct = products.find(product => product.id === item.catalogProductId);
                return (
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
                      <p className="font-mono text-xs text-[#4A5F57]">
                        {item.quantity} {item.unit} total · {availableQuantity} available · {damagedQuantity} damaged
                      </p>
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
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#E9E4D9] bg-[#FAF8F5] p-2.5">
                    <span className="mr-auto text-xs font-bold text-[#33473D]">Adjust stock</span>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!onUpdateInventory || item.quantity <= damagedQuantity}
                        onClick={() => saveInventoryCounts(item, item.quantity - 1, damagedQuantity)}
                        aria-label={`Remove one ${item.name}`}
                        className="rounded-lg border border-[#D5CFC1] bg-white p-1.5 text-[#1B4332] hover:bg-[#EAF4EC] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-8 text-center font-mono text-xs font-black text-[#1B4332]">{item.quantity}</span>
                      <button
                        type="button"
                        disabled={!onUpdateInventory}
                        onClick={() => saveInventoryCounts(item, item.quantity + 1, damagedQuantity)}
                        aria-label={`Add one ${item.name}`}
                        className="rounded-lg border border-[#D5CFC1] bg-white p-1.5 text-[#1B4332] hover:bg-[#EAF4EC] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!onUpdateInventory || availableQuantity === 0 || item.condition === 'Lost'}
                      onClick={() => saveInventoryCounts(item, item.quantity, damagedQuantity + 1)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-[11px] font-bold text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" /> Mark damaged
                    </button>
                    <button
                      type="button"
                      disabled={!onUpdateInventory || damagedQuantity === 0 || item.condition === 'Lost'}
                      onClick={() => saveInventoryCounts(item, item.quantity, damagedQuantity - 1)}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Wrench className="h-3.5 w-3.5" /> Repaired
                    </button>
                    {item.category === 'Rental Assets' && (
                      catalogProduct ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1.5 text-[11px] font-bold text-emerald-800">
                          <ShoppingBag className="h-3.5 w-3.5" /> In product catalog
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!onPublishRentalProduct}
                          onClick={() => openRentalListing(item)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#1B4332] px-2 py-1.5 text-[11px] font-bold text-white hover:bg-[#143326] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" /> Add to catalog
                        </button>
                      )
                    )}
                  </div>
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
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#D5CFC1] bg-white p-8 text-center text-sm text-[#4A5F57]">
              {inventory.length
                ? 'No inventory items match these filters.'
                : 'No inventory items recorded yet. Use "Record Inventory Item" to start the association inventory registry.'}
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
              <h2 className="text-lg font-black text-white">Auditor Review Desk</h2>
              <p className="mt-1 text-sm text-emerald-100">Review transaction records, verify entries, and flag discrepancies.</p>
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
          {filteredTransactions.length ? visibleTransactions.map(transaction => (
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
          {visibleTransactionCount < filteredTransactions.length && (
            <div className="flex items-center justify-between rounded-xl border-[#D5CFC1] bg-white p-3">
              <span className="text-xs font-semibold text-[#33473D]">Showing {visibleTransactions.length} of {filteredTransactions.length} records</span>
              <button type="button" onClick={() => setVisibleTransactionCount(count => count + 10)} className="rounded-lg bg-[#1B4332] px-3 py-2 text-xs font-bold text-white">Load 10 more</button>
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
                <input type="text" required value={invName} onChange={e => setInvName(e.target.value)} placeholder="IGP Plastic Chairs, Harvest Sacks, Knapsack Sprayer" className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
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
                  <select
                    value={invCondition}
                    onChange={e => {
                      const nextCondition = e.target.value as InventoryItem['condition'];
                      setInvCondition(nextCondition);
                      if (nextCondition === 'Good' || nextCondition === 'Lost') setInvDamagedQuantity(0);
                      else if (nextCondition === 'Damaged') setInvDamagedQuantity(Number(invQuantity));
                      else setInvDamagedQuantity(Math.min(Number(invQuantity), Math.max(1, Number(invDamagedQuantity))));
                    }}
                    className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="Good">Good</option>
                    <option value="Needs Repair">Needs Repair</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Quantity</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={invQuantity}
                    onChange={e => {
                      const nextQuantity = Number(e.target.value);
                      setInvQuantity(nextQuantity);
                      setInvDamagedQuantity(invCondition === 'Damaged' ? nextQuantity : Math.min(invDamagedQuantity, nextQuantity));
                    }}
                    className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 font-mono text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-[#4A5F57]">Total units currently owned.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Damaged Units</label>
                  <input type="number" min={0} max={Math.max(0, invQuantity)} step={1} required value={invDamagedQuantity} onChange={e => setInvDamagedQuantity(Number(e.target.value))} className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 font-mono text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
                  <p className="mt-1 text-[10px] text-[#4A5F57]">Available units are calculated automatically.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Unit</label>
                  <input type="text" required value={invUnit} onChange={e => setInvUnit(e.target.value)} placeholder="Pieces, sacks, or units" className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Storage Location (Optional)</label>
                <input type="text" value={invLocation} onChange={e => setInvLocation(e.target.value)} placeholder="Barangay Alegria Covered Court Storage" className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-[#4A5F57]">Custodial / Inventory Notes (Optional)</label>
                <textarea rows={3} value={invNotes} onChange={e => setInvNotes(e.target.value)} placeholder="Counted 120 pieces during quarterly physical inventory; 8 chairs returned broken by renters." className="w-full rounded-xl border border-[#D5CFC1] bg-white px-3.5 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none" />
              </div>
              {inventoryError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{inventoryError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowInventoryModal(false)} className="flex-1 rounded-xl border border-[#D5CFC1] px-3 py-2.5 text-sm font-semibold text-[#1B4332] hover:bg-[#EAF4EE]">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Save Inventory Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {rentalListingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="rental-listing-title" className="w-full max-w-xl rounded-2xl border border-[#D5CFC1] bg-[#F7F4EF] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#D5CFC1] bg-[#EAF4EC] px-5 py-4">
              <div>
                <h2 id="rental-listing-title" className="text-base font-bold text-[#1B4332]">Add Rental to Product Catalog</h2>
                <p className="mt-0.5 text-xs text-[#4A5F57]">{rentalListingItem.name} · {getAvailableInventoryQuantity(rentalListingItem)} available</p>
              </div>
              <button type="button" onClick={() => setRentalListingItem(null)} className="text-xl font-bold text-[#4A5F57] hover:text-[#1B4332]" aria-label="Close rental listing dialog">&times;</button>
            </div>
            <form onSubmit={saveRentalListing} className="space-y-4 p-5">
              <label className="block text-xs font-bold uppercase text-[#4A5F57]">
                Rental Rate (PHP)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={rentalPrice}
                  onChange={event => setRentalPrice(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2.5 font-mono text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none"
                />
              </label>
              <label className="block text-xs font-bold uppercase text-[#4A5F57]">
                Rate Unit
                <input
                  type="text"
                  required
                  value={rentalUnit}
                  onChange={event => setRentalUnit(event.target.value)}
                  placeholder="per day, per event, per unit"
                  className="mt-1 w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2.5 text-sm text-[#1B4332] focus:border-emerald-600 focus:outline-none"
                />
              </label>
              <label className="block text-xs font-bold uppercase text-[#4A5F57]">
                Public Description
                <textarea
                  rows={3}
                  required
                  value={rentalDescription}
                  onChange={event => setRentalDescription(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D5CFC1] bg-white px-3 py-2.5 text-sm font-normal normal-case text-[#1B4332] focus:border-emerald-600 focus:outline-none"
                />
              </label>
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                The rental will appear in the public product catalog. Its availability will follow the inventory count and damaged-unit updates.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setRentalListingItem(null)} className="flex-1 rounded-xl border border-[#D5CFC1] px-3 py-2.5 text-sm font-semibold text-[#1B4332] hover:bg-[#EAF4EE]">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-[#1B4332] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#143326]">Publish Rental</button>
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
