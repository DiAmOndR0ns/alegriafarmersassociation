import React, { useEffect, useMemo, useState } from 'react';
import {
  HogRaisingState, HogStage, HogHerdBreakdown, IgpExpense, IgpSale, IgpChoreLog, Member, User, Meeting
} from '../types';
import {
  Briefcase, Plus, Trash2, Printer, Calculator, Lock, ArrowDownRight, ArrowUpRight,
  Pencil, X, PiggyBank, Sparkles, Filter, CheckCircle, AlertTriangle
} from 'lucide-react';
import AttendanceDividendCalculatorModal from './AttendanceDividendCalculatorModal';

interface LivestockMonitorProps {
  state: HogRaisingState;
  members: Member[];
  meetings?: Meeting[];
  onAddExpense: (expense: Omit<IgpExpense, 'id' | 'recordedBy'>) => void;
  onUpdateExpense?: (expense: IgpExpense) => void;
  onDeleteExpense?: (expenseId: string) => void;
  onAddSale: (sale: Omit<IgpSale, 'id' | 'recordedBy'>) => void;
  onUpdateSale?: (sale: IgpSale) => void;
  onDeleteSale?: (saleId: string) => void;
  /** @deprecated Kept for backward compatibility */
  onAddChoreLog?: (chore: Omit<IgpChoreLog, 'id'>) => void;
  onUpdateOpeningHogCount?: (count: number, herdBreakdown?: HogHerdBreakdown) => void;
  onAddProduce?: (produce: string) => void;
  onDeleteProduce?: (produce: string) => void;
  isTreasurerOrOfficer: boolean;
  /** Only the treasurer may record, edit or delete expenses. Pass e.g. currentUser.role === 'Treasurer'. */
  isTreasurer: boolean;
  currentUser: User;
  isOfficerMode?: boolean;
  closedYears?: number[];
  onCloseDecemberBook?: (year: number) => void;
}

const DEFAULT_PROJECTS = [
  'Swine Raising (Baboyan)',
  'Cattle Raising (Bakahan)',
  'Poultry Raising (RTL)'
];

const QUARTERS = [
  { name: 'Q1', label: 'Jan – Mar', months: ['01', '02', '03'] },
  { name: 'Q2', label: 'Apr – Jun', months: ['04', '05', '06'] },
  { name: 'Q3', label: 'Jul – Sep', months: ['07', '08', '09'] },
  { name: 'Q4', label: 'Oct – Dec', months: ['10', '11', '12'] },
];

// Only expenses in these categories add heads to the inventory.
const STOCK_CATEGORIES = ['Piglets / Stock', 'Calves / Cattle Stock', 'RTL Pullets Stock'];

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toInt = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
// Baselines may be negative: they are stored as (headcount typed) minus (ledger additions and sales).
const toSigned = (v: unknown) => Math.trunc(Number(v) || 0);
// Local date (not UTC), so entries made between 12:00 AM and 8:00 AM in the Philippines get the right day.
const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const isRental = (p: string) => /rental|lingkoranan|sako/i.test(p);

const isSwineProject = (p: string) => /swine|hog|baboy/i.test(p);
const isCattleProject = (p: string) => /cattle|baka/i.test(p);
const isPoultryProject = (p: string) => /poultry|rtl|manok|chicken/i.test(p);

const getProjectDisplayTitle = (p: string) => {
  if (isSwineProject(p)) return 'Swine / Baboy';
  if (isCattleProject(p)) return 'Cattle / Baka';
  if (isPoultryProject(p)) return 'Poultry / Manok';
  return p.replace(/[\p{Extended_Pictographic}\u2600-\u27BF]/gu, '').trim() || p;
};

const getExpenseCategories = (produce: string): string[] => {
  if (isSwineProject(produce)) return ['Feeds', 'Piglets / Stock', 'Breeding / AI Service', 'Vitamins & Medicines', 'Pen Care & Utilities', 'Other'];
  if (isCattleProject(produce)) return ['Feed Supplements / Silage', 'Calves / Cattle Stock', 'Veterinary Care & Vaccines', 'Pasture & Fencing', 'Other'];
  if (isPoultryProject(produce)) return ['Layer Feeds', 'RTL Pullets Stock', 'Vitamins & Antibiotics', 'Coop Maintenance', 'Egg Trays & Packaging', 'Other'];
  if (/chairs|lingkoranan/i.test(produce)) return ['New Chairs', 'Repairs & Maintenance', 'Transport', 'Other'];
  if (/sacks|sako/i.test(produce)) return ['New Sacks', 'Washing & Drying', 'Repairs', 'Other'];
  return ['Supplies & Materials', 'Equipment', 'Maintenance & Repairs', 'Other'];
};

const inputCls = 'w-full px-3 py-2 text-sm bg-white border border-[#D5CFC1] rounded-xl text-[#1B4332] focus:outline-none focus:border-emerald-600 font-semibold';
const labelCls = 'block text-[11px] font-black text-[#1B4332] uppercase mb-1';

// Stage matchers used by the inventory reconciliation.
const inFattening = (s?: HogStage) => s === 'Fattening';
const inBreeding = (s?: HogStage) => s === 'Breeding' || s === 'Gestation';
const inDispersal = (s?: HogStage) => s === 'Dispersal';
const inLactating = (s?: HogStage) => s === 'Lactating';
const inRtl = (s?: HogStage) => s === 'RTL' || !s;

export default function LivestockMonitor({
  state,
  members,
  meetings = [],
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
  onAddSale,
  onUpdateSale,
  onDeleteSale,
  onUpdateOpeningHogCount,
  onAddProduce,
  onDeleteProduce,
  isTreasurerOrOfficer,
  isTreasurer,
  currentUser,
  closedYears = state.closedYears || [],
  onCloseDecemberBook,
}: LivestockMonitorProps) {
  // ---------- Projects ----------
  const rawProduces = state.produces && state.produces.length > 0 ? state.produces : DEFAULT_PROJECTS;
  const produces = useMemo(
    () => Array.from(new Set(rawProduces.filter((p) => p && p.trim() && !/tilapia/i.test(p)))),
    [rawProduces]
  );
  const [selected, setSelected] = useState<string>(produces[0] || 'Swine Raising (Baboyan)');
  useEffect(() => {
    if (produces.length === 0) setSelected('');
    else if (!produces.includes(selected)) setSelected(produces[0]);
  }, [produces, selected]);

  const [showAddProject, setShowAddProject] = useState(false);
  const [newProject, setNewProject] = useState('');
  const addProject = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    onAddProduce?.(clean);
    setSelected(clean);
    setNewProject('');
    setShowAddProject(false);
  };

  const isSwine = isSwineProject(selected);
  const isCattle = isCattleProject(selected);
  const isPoultry = isPoultryProject(selected);

  // ---------- Live Livestock Inventory Reconciliation ----------
  const bd: HogHerdBreakdown = state.herdBreakdown || {
    fattening: 44,
    gestation: 3,
    lactating: 0,
    dispersal: 4,
    cattleFattening: 20,
    cattleDispersal: 2,
    rtlCount: 250
  };
  const baseSwineFattening = bd.fattening !== undefined ? toSigned(bd.fattening) : 44;
  const baseSwineBreeding = bd.gestation !== undefined ? toSigned(bd.gestation) : 3;
  const baseSwineDispersal = bd.dispersal !== undefined ? toSigned(bd.dispersal) : 4;
  const baseSwineLactating = toSigned(bd.lactating);

  const baseCattleFattening = bd.cattleFattening !== undefined ? toSigned(bd.cattleFattening) : 20;
  const baseCattleDispersal = bd.cattleDispersal !== undefined ? toSigned(bd.cattleDispersal) : 2;

  const baseRtl = bd.rtlCount !== undefined ? toSigned(bd.rtlCount) : 250;

  // Selected-project records (used for the ledger, finance cards and reports).
  const expenses = useMemo(() => state.expenses.filter((e) => (e.produce || produces[0]) === selected), [state.expenses, selected, produces]);
  const sales = useMemo(() => state.sales.filter((s) => (s.produce || produces[0]) === selected), [state.sales, selected, produces]);

  // Net change in heads for one portfolio and stage, computed from ALL projects' records,
  // so the three portfolio cards never depend on which project is currently selected.
  // Heads are added only by stock-purchase expenses, and removed by sales / dispersals.
  const projectOf = (r: { produce?: string }) => r.produce || produces[0];
  const stageDelta = (inProject: (p: string) => boolean, inStage: (s?: HogStage) => boolean) => {
    const added = state.expenses
      .filter((e) => inProject(projectOf(e)) && e.quantity && STOCK_CATEGORIES.includes(e.category) && inStage(e.hogStage))
      .reduce((sum, e) => sum + toInt(e.quantity), 0);
    const sold = state.sales
      .filter((s) => inProject(projectOf(s)) && inStage(s.hogStage))
      .reduce((sum, s) => sum + toInt(s.produceCount || s.hogsCount), 0);
    return added - sold;
  };

  const dSwineFattening = stageDelta(isSwineProject, inFattening);
  const dSwineBreeding = stageDelta(isSwineProject, inBreeding);
  const dSwineDispersal = stageDelta(isSwineProject, inDispersal);
  const dSwineLactating = stageDelta(isSwineProject, inLactating);
  const dCattleFattening = stageDelta(isCattleProject, inFattening);
  const dCattleDispersal = stageDelta(isCattleProject, inDispersal);
  const dRtl = stageDelta(isPoultryProject, inRtl);

  // Swine stage counts
  const currentSwineFattening = Math.max(0, baseSwineFattening + dSwineFattening);
  const currentSwineBreeding = Math.max(0, baseSwineBreeding + dSwineBreeding);
  const currentSwineDispersal = Math.max(0, baseSwineDispersal + dSwineDispersal);
  const currentSwineLactating = Math.max(0, baseSwineLactating + dSwineLactating);
  const totalSwine = currentSwineFattening + currentSwineBreeding + currentSwineDispersal + currentSwineLactating;

  // Cattle stage counts
  const currentCattleFattening = Math.max(0, baseCattleFattening + dCattleFattening);
  const currentCattleDispersal = Math.max(0, baseCattleDispersal + dCattleDispersal);
  const totalCattle = currentCattleFattening + currentCattleDispersal;

  // Poultry stage counts
  const currentRtl = Math.max(0, baseRtl + dRtl);

  // ---------- Finance Totals ----------
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalRevenue = sales.reduce((sum, s) => sum + s.revenue, 0);
  const net = totalRevenue - totalExpenses;

  // ---------- Ledger Table (with CRUD) ----------
  const ledger = useMemo(() => [
    ...expenses.map((e) => ({
      id: e.id,
      itemType: 'expense' as const,
      rawExpense: e,
      date: e.date,
      kind: 'Expense' as const,
      stage: e.hogStage,
      label: e.category,
      detail: e.description,
      qty: e.quantity,
      amount: -e.amount,
      by: e.recordedBy
    })),
    ...sales.map((s) => ({
      id: s.id,
      itemType: 'sale' as const,
      rawSale: s,
      date: s.date,
      kind: 'Income' as const,
      stage: s.hogStage,
      label: isRental(selected) ? 'Rental' : 'Sale',
      detail: s.notes || '',
      qty: s.produceCount || s.hogsCount,
      amount: s.revenue,
      by: s.recordedBy
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [expenses, sales, selected]);

  const [view, setView] = useState<'ledger' | 'report'>('ledger');
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const yearOptions = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    [...state.expenses, ...state.sales].forEach((r) => { const y = parseInt(r.date?.substring(0, 4)); if (y) years.add(y); });
    return Array.from(years).sort((a, b) => b - a);
  }, [state.expenses, state.sales]);

  const quarters = QUARTERS.map((q) => {
    const inQ = (d: string) => parseInt(d.substring(0, 4)) === reportYear && q.months.includes(d.substring(5, 7));
    const exp = expenses.filter((e) => inQ(e.date)).reduce((s, e) => s + e.amount, 0);
    const rev = sales.filter((s) => inQ(s.date)).reduce((sum, s) => sum + s.revenue, 0);
    const units = sales.filter((s) => inQ(s.date)).reduce((sum, s) => sum + toInt(s.produceCount || s.hogsCount), 0);
    return { ...q, exp, rev, units, net: rev - exp };
  });
  const yearTotals = quarters.reduce((t, q) => ({ exp: t.exp + q.exp, rev: t.rev + q.rev, units: t.units + q.units }), { exp: 0, rev: 0, units: 0 });
  const isYearClosed = closedYears.includes(reportYear);

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = quarters.map((q) => `<tr><td>${q.name} (${q.label})</td><td>${q.units}</td><td>${peso(q.rev)}</td><td>${peso(q.exp)}</td><td>${peso(q.net)}</td></tr>`).join('');
    const safeProject = esc(selected);
    w.document.write(`<!doctype html><html><head><title>${safeProject} – ${reportYear} Report</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#1B4332}h1{font-size:18px;margin:0}p{margin:4px 0 16px;font-size:12px;color:#555}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#EAF4EC}
      tfoot td{font-weight:bold;background:#f7f7f7}</style></head><body>
      <h1>Alegria Farmers Association – ${safeProject}</h1>
      <p>Quarterly IGP Report • ${reportYear}${isYearClosed ? ' • BOOK CLOSED' : ''}</p>
      <table><thead><tr><th>Quarter</th><th>Units Sold</th><th>Revenue</th><th>Expenses</th><th>Net</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td>${yearTotals.units}</td><td>${peso(yearTotals.rev)}</td><td>${peso(yearTotals.exp)}</td><td>${peso(yearTotals.rev - yearTotals.exp)}</td></tr></tfoot></table>
      <p style="margin-top:24px">Generated ${new Date().toLocaleString()}</p>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  // ---------- Modals State (Create & Edit) ----------
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<IgpExpense | null>(null);

  const [showSaleModal, setShowSaleModal] = useState(false);
  const [editingSale, setEditingSale] = useState<IgpSale | null>(null);

  const [showDividends, setShowDividends] = useState(false);
  const [formError, setFormError] = useState('');

  // Expense Form Fields
  const [expStage, setExpStage] = useState<HogStage>('Fattening');
  const [expCategory, setExpCategory] = useState('Feeds');
  const [expCustom, setExpCustom] = useState('');
  const [expQty, setExpQty] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(today());

  // Sale Form Fields
  const [saleStage, setSaleStage] = useState<HogStage>('Fattening');
  const [saleQty, setSaleQty] = useState('');
  const [saleRevenue, setSaleRevenue] = useState('');
  const [saleDate, setSaleDate] = useState(today());
  const [saleNotes, setSaleNotes] = useState('');

  const openAddExpense = () => {
    setEditingExpense(null);
    setExpCategory(getExpenseCategories(selected)[0] || 'Feeds');
    setExpStage(isSwine ? 'Fattening' : isCattle ? 'Fattening' : isPoultry ? 'RTL' : 'General');
    setExpCustom('');
    setExpQty('');
    setExpDesc('');
    setExpAmount('');
    setExpDate(today());
    setFormError('');
    setShowExpenseModal(true);
  };

  const openEditExpense = (expense: IgpExpense) => {
    setEditingExpense(expense);
    setExpCategory(expense.category);
    setExpStage(expense.hogStage || (isSwine ? 'Fattening' : isCattle ? 'Fattening' : isPoultry ? 'RTL' : 'General'));
    setExpCustom('');
    setExpQty(expense.quantity ? String(expense.quantity) : '');
    setExpDesc(expense.description);
    setExpAmount(String(expense.amount));
    setExpDate(expense.date);
    setFormError('');
    setShowExpenseModal(true);
  };

  const openAddSale = () => {
    setEditingSale(null);
    // Poultry defaults to eggs / other income so a routine egg sale never reduces the bird count.
    setSaleStage(isSwine ? 'Fattening' : isCattle ? 'Fattening' : 'General');
    setSaleQty('');
    setSaleRevenue('');
    setSaleNotes('');
    setSaleDate(today());
    setFormError('');
    setShowSaleModal(true);
  };

  const openEditSale = (sale: IgpSale) => {
    setEditingSale(sale);
    setSaleStage(sale.hogStage || (isSwine ? 'Fattening' : isCattle ? 'Fattening' : isPoultry ? 'RTL' : 'General'));
    setSaleQty(String(sale.produceCount || sale.hogsCount || ''));
    setSaleRevenue(String(sale.revenue));
    setSaleNotes(sale.notes || '');
    setSaleDate(sale.date);
    setFormError('');
    setShowSaleModal(true);
  };

  const closedMsg = (date: string) => {
    const yr = parseInt(date.substring(0, 4));
    return closedYears.includes(yr) ? `The ${yr} financial book is already closed.` : '';
  };

  const submitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTreasurer) return setFormError('Only the treasurer can record or change expenses.');
    const amount = parseFloat(expAmount);
    if (!(amount > 0) || !expDesc.trim()) return setFormError('Please enter a valid amount and description.');
    const closed = closedMsg(expDate);
    if (closed) return setFormError(closed);

    const cat = expCategory === 'Other' ? (expCustom.trim() || 'Other') : expCategory;
    // Quantity only means "heads purchased" for stock categories; ignore it everywhere else.
    const qty = expQty && STOCK_CATEGORIES.includes(cat) ? parseInt(expQty, 10) : undefined;

    if (editingExpense) {
      onUpdateExpense?.({
        ...editingExpense,
        produce: selected,
        hogStage: expStage,
        category: cat,
        quantity: qty,
        description: expDesc.trim(),
        amount,
        date: expDate,
      });
    } else {
      onAddExpense({
        produce: selected,
        hogStage: expStage,
        category: cat,
        quantity: qty,
        description: expDesc.trim(),
        amount,
        date: expDate,
      });
    }
    setShowExpenseModal(false);
  };

  const submitSale = (e: React.FormEvent) => {
    e.preventDefault();
    // Dispersal to members can be free or paid later, so revenue may be 0 for that stage only.
    const isDispersalSale = saleStage === 'Dispersal';
    const revenue = saleRevenue.trim() === '' && isDispersalSale ? 0 : parseFloat(saleRevenue);
    const qty = parseInt(saleQty, 10);
    if (!(revenue >= (isDispersalSale ? 0 : 0.01)) || !(qty >= 1)) {
      return setFormError(
        isDispersalSale
          ? 'Please enter a valid quantity. Revenue can be 0 for a free dispersal.'
          : 'Please enter a valid quantity and amount.'
      );
    }
    const closed = closedMsg(saleDate);
    if (closed) return setFormError(closed);

    if (editingSale) {
      onUpdateSale?.({
        ...editingSale,
        produce: selected,
        hogStage: saleStage,
        date: saleDate,
        hogsCount: isSwine ? qty : 0,
        produceCount: qty,
        revenue,
        notes: saleNotes.trim() || undefined,
      });
    } else {
      onAddSale({
        produce: selected,
        hogStage: saleStage,
        date: saleDate,
        hogsCount: isSwine ? qty : 0,
        produceCount: qty,
        revenue,
        notes: saleNotes.trim() || undefined,
      });
    }
    setShowSaleModal(false);
  };

  return (
    <div id="livestock-monitor-container" className="space-y-6 text-left">

      {/* ========================================================================= */}
      {/* 1. MASTER ASSOCIATION LIVESTOCK STATUS BAR (EXECUTIVE OVERVIEW)           */}
      {/* ========================================================================= */}
      <section className="bg-white text-slate-900 rounded-2xl border-[#D5CFC1] p-4 sm:p-5 shadow-sm space-y-4 min-w-0">
        <div className="flex min-w-0 flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#E9E4D9] pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                Live Cooperative Assets
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black font-display tracking-tight mt-2 text-[#1B4332] flex items-start sm:items-center gap-2 min-w-0">
              <Briefcase className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5 sm:mt-0" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere] leading-tight">AFA Livestock &amp; IGP Monitoring</span>
            </h2>
          </div>

          {isTreasurerOrOfficer && (
            <button
              type="button"
              onClick={() => setShowAddProject(true)}
              className="min-h-10 w-full sm:w-auto px-3.5 py-2 rounded-lg bg-[#1B4332] text-white hover:bg-[#143326] text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Add New IGP</span>
            </button>
          )}
        </div>

        {/* All Association IGP Portfolios (Automatically renders a card for each active or added IGP) */}
        <div className={`grid min-w-0 grid-cols-1 sm:grid-cols-2 ${
          produces.length <= 2
            ? 'lg:grid-cols-2'
            : produces.length === 3
            ? 'lg:grid-cols-3'
            : 'lg:grid-cols-3 xl:grid-cols-4'
        } gap-2.5`}>
          {produces.map((p) => {
            const isSelected = selected === p;
            const isSwine = isSwineProject(p);
            const isCattle = isCattleProject(p);
            const isPoultry = isPoultryProject(p);

            // Project financial & ledger summary
            const pExpenses = state.expenses.filter((e) => (e.produce || produces[0]) === p);
            const pSales = state.sales.filter((s) => (s.produce || produces[0]) === p);
            const pTotalExp = pExpenses.reduce((sum, e) => sum + e.amount, 0);
            const pTotalRev = pSales.reduce((sum, s) => sum + s.revenue, 0);
            const pNet = pTotalRev - pTotalExp;
            const pUnits = pSales.reduce((sum, s) => sum + toInt(s.produceCount || s.hogsCount), 0);

            // Clean title without any livestock emoji
            const displayTitle = getProjectDisplayTitle(p);

            // Badge pill at top right
            let badgeText = 'Active IGP';
            if (isSwine) badgeText = `${totalSwine} Head`;
            else if (isCattle) badgeText = `${totalCattle} Head`;
            else if (isPoultry) badgeText = `${currentRtl} Head`;
            else if (pUnits > 0) badgeText = `${pUnits} ${isRental(p) ? 'Rented' : 'Units'}`;
            else if (pTotalRev > 0) badgeText = peso(pTotalRev);

            // 3 structured metric rows
            type MetricRow = { label: string; value: string; highlight?: 'emerald' | 'amber' };
            let row1: MetricRow = { label: 'Revenue', value: peso(pTotalRev) };
            let row2: MetricRow = { label: 'Expenses', value: peso(pTotalExp) };
            let row3: MetricRow = {
              label: 'Net Balance',
              value: peso(pNet),
              highlight: pNet >= 0 ? 'emerald' : 'amber'
            };

            if (isSwine) {
              row1 = { label: 'Fattening', value: String(currentSwineFattening) };
              row2 = { label: 'Breeding (Anay)', value: String(currentSwineBreeding) };
              row3 = { label: 'For Dispersal', value: String(currentSwineDispersal), highlight: 'amber' };
            } else if (isCattle) {
              row1 = { label: 'Fattening', value: String(currentCattleFattening) };
              row2 = { label: 'For Dispersal', value: String(currentCattleDispersal), highlight: 'amber' };
              row3 = { label: 'Status', value: 'Active Livelihood' };
            } else if (isPoultry) {
              row1 = { label: 'Ready-to-Lay (RTL)', value: String(currentRtl) };
              row2 = { label: 'Egg Production', value: 'Active', highlight: 'emerald' };
              row3 = { label: 'Coop Setup', value: 'Layer Cages' };
            } else if (pUnits > 0) {
              row1 = { label: isRental(p) ? 'Units Rented' : 'Units Sold', value: String(pUnits) };
              row2 = { label: 'Gross Revenue', value: peso(pTotalRev) };
              row3 = { label: 'Net Balance', value: peso(pNet), highlight: pNet >= 0 ? 'emerald' : 'amber' };
            }

            return (
              <button
                key={p}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelected(p)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 flex flex-col justify-between ${
                  isSelected
                    ? 'bg-emerald-50 text-slate-900 border-emerald-700 shadow-sm'
                    : 'bg-white hover:bg-slate-50 text-slate-900 border-[#D5CFC1]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-xs font-black uppercase tracking-wider leading-snug break-words text-[#1B4332]">
                      {displayTitle}
                    </span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 bg-emerald-100 text-[#1B4332]">
                      {badgeText}
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1 text-xs">
                    <div className="flex justify-between items-center gap-2 font-bold">
                      <span className="text-slate-700">{row1.label}</span>
                      <span className="font-mono font-black text-[#1B4332]">{row1.value}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2 font-bold">
                      <span className="text-slate-700">{row2.label}</span>
                      <span className="font-mono font-black text-[#1B4332]">{row2.value}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2 font-bold">
                      <span className="text-slate-700">{row3.label}</span>
                      <span className={`font-mono font-black ${
                        row3.highlight === 'amber'
                          ? 'text-amber-800'
                          : row3.highlight === 'emerald'
                          ? 'text-emerald-800'
                          : 'text-slate-600'
                      }`}>
                        {row3.value}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. PROJECT SWITCHER BAR                                                   */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl border border-[#D5CFC1] bg-white">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-black uppercase text-[#1B4332] flex items-center gap-1.5 mr-1">
            <Filter className="w-4 h-4 text-emerald-700" />
            <span>Select Project:</span>
          </span>
          {produces.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSelected(p)}
              aria-pressed={selected === p}
              className={`min-h-11 px-3.5 py-2 rounded-xl text-sm font-bold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
                selected === p
                  ? 'bg-[#1B4332] text-white border-[#1B4332] shadow-sm'
                  : 'bg-[#FAF8F5] text-[#1B4332] border-[#D5CFC1] hover:bg-[#EAF4EC]'
              }`}
            >
              {getProjectDisplayTitle(p)}
            </button>
          ))}
        </div>

        {isTreasurerOrOfficer && (
          <button
            type="button"
            onClick={() => setShowAddProject(true)}
            className="px-3.5 py-2 text-xs font-black rounded-xl border border-dashed border-[#1B4332]/50 text-[#1B4332] hover:bg-[#EAF4EC] cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New IGP</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. ACTIVE PROJECT LIVESTOCK & FINANCIAL METRIC CARDS                      */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-[#1B4332]">
            {getProjectDisplayTitle(selected)} — Active Status
          </h3>
          {isTreasurerOrOfficer && onDeleteProduce && produces.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Are you sure you want to remove the "${selected}" project?`)) {
                  onDeleteProduce(selected);
                }
              }}
              className="text-xs text-rose-700 hover:text-rose-900 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove Project
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Headcount Card */}
          <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/70">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 block">
              {isSwine ? 'Total Swine Heads' : isCattle ? 'Total Cattle Heads' : isPoultry ? 'Total RTL Birds' : 'Inventory / Units'}
            </span>
            <div className="text-2xl font-black text-[#1B4332] font-mono mt-1">
              {isSwine ? `${totalSwine} heads` : isCattle ? `${totalCattle} heads` : isPoultry ? `${currentRtl} birds` : 'Active'}
            </div>

          </div>

          {/* Revenue Card */}
          <div className="p-4 rounded-2xl border border-emerald-200 bg-white">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700 block">Gross Revenue</span>
            <div className="text-2xl font-black text-emerald-700 font-mono mt-1">{peso(totalRevenue)}</div>
          </div>

          {/* Expenses Card */}
          <div className="p-4 rounded-2xl border border-rose-200 bg-white">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700 block">Total Expenses</span>
            <div className="text-2xl font-black text-rose-700 font-mono mt-1">{peso(totalExpenses)}</div>
          </div>

          {/* Net Margin Card */}
          <div className="p-4 rounded-2xl border border-[#D5CFC1] bg-white">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700 block">Net Proceeds</span>
            <div className={`text-2xl font-black font-mono mt-1 ${net >= 0 ? 'text-[#1B4332]' : 'text-rose-700'}`}>
              {peso(net)}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. LEDGER & QUARTERLY REPORT (WITH FULL CRUD)                             */}
      {/* ========================================================================= */}
      <section className="rounded-3xl border border-[#D5CFC1] bg-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex rounded-xl border border-[#D5CFC1] overflow-hidden">
            <button
              type="button"
              aria-pressed={view === 'ledger'}
              onClick={() => setView('ledger')}
              className={`min-h-11 px-4 py-2 text-sm font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
                view === 'ledger' ? 'bg-[#1B4332] text-white' : 'bg-white text-[#1B4332] hover:bg-[#EAF4EC]'
              }`}
            >
              Project Ledger
            </button>
            <button
              type="button"
              aria-pressed={view === 'report'}
              onClick={() => setView('report')}
              className={`min-h-11 px-4 py-2 text-sm font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
                view === 'report' ? 'bg-[#1B4332] text-white' : 'bg-white text-[#1B4332] hover:bg-[#EAF4EC]'
              }`}
            >
              Quarterly Report
            </button>
          </div>

          {/* Action Buttons for Authorized Officers (Auditor, Treasurer, President, VP) */}
          {isTreasurerOrOfficer && view === 'ledger' && (
            <div className="flex items-center gap-2">
              {isTreasurer && (
              <button
                type="button"
                onClick={openAddExpense}
                className="px-3.5 py-2 text-xs font-black rounded-xl border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Expense</span>
              </button>
              )}
              <button
                type="button"
                onClick={openAddSale}
                className="min-h-11 px-3.5 py-2 text-sm font-bold rounded-xl bg-[#1B4332] text-white hover:bg-[#143326] cursor-pointer flex items-center gap-1.5 shadow-xs focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Sale / Income</span>
              </button>
            </div>
          )}
        </div>

        {/* VIEW 1: LEDGER TABLE WITH EDIT & DELETE */}
        {view === 'ledger' ? (
          ledger.length === 0 ? (
            <div className="text-center py-12 bg-[#FAF8F5] rounded-2xl border border-dashed border-[#D5CFC1] space-y-2">
              <p className="text-sm font-semibold text-slate-700">No transactions recorded for {selected} yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="py-2.5 pr-3 font-black">Date</th>
                    <th className="py-2.5 pr-3 font-black">Type / Category</th>
                    <th className="py-2.5 pr-3 font-black">Stage / Tag</th>
                    <th className="py-2.5 pr-3 font-black">Description & Notes</th>
                    <th className="py-2.5 pr-3 text-right font-black">Qty / Heads</th>
                    <th className="py-2.5 pr-3 text-right font-black">Amount</th>
                    <th className="py-2.5 pr-3 font-black">Recorded By</th>
                    {isTreasurerOrOfficer && <th className="py-2.5 text-center font-black">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 pr-3 font-mono text-slate-600 whitespace-nowrap">{r.date}</td>
                      <td className="py-2.5 pr-3 font-black text-[#1B4332] whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          r.kind === 'Expense' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {r.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600 font-bold whitespace-nowrap">
                        {r.stage ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {r.stage}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700 max-w-xs whitespace-normal break-words">{r.detail}</td>
                      <td className="py-2.5 pr-3 text-right font-mono font-bold text-slate-800">
                        {r.qty ? `${r.qty}` : '—'}
                      </td>
                      <td className={`py-2.5 pr-3 text-right font-mono font-black whitespace-nowrap ${
                        r.amount < 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}>
                        {r.amount < 0 ? '−' : '+'}{peso(Math.abs(r.amount))}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-500 text-[10px] font-bold whitespace-nowrap">{r.by || 'Officer'}</td>

                      {/* CRUD Actions: Edit & Delete (both blocked for closed years) */}
                      {isTreasurerOrOfficer && (
                        <td className="py-2.5 text-center whitespace-nowrap">
                          {r.itemType === 'sale' || isTreasurer ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const locked = closedMsg(r.date);
                                if (locked) {
                                  window.alert(locked);
                                  return;
                                }
                                if (r.itemType === 'expense') openEditExpense(r.rawExpense);
                                else openEditSale(r.rawSale);
                              }}
                              className="p-1 rounded-lg hover:bg-slate-200 text-[#1B4332] transition-colors cursor-pointer"
                              title="Edit transaction"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const locked = closedMsg(r.date);
                                if (locked) {
                                  window.alert(locked);
                                  return;
                                }
                                if (window.confirm(`Delete this ${r.kind.toLowerCase()} record of ${peso(Math.abs(r.amount))}?`)) {
                                  if (r.itemType === 'expense') onDeleteExpense?.(r.id);
                                  else onDeleteSale?.(r.id);
                                }
                              }}
                              className="p-1 rounded-lg hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer"
                              title="Delete transaction"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400">Treasurer only</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* VIEW 2: QUARTERLY FINANCIAL REPORT */
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={reportYear}
                onChange={(e) => setReportYear(Number(e.target.value))}
                aria-label="Report year"
                className="px-3 py-2 text-sm rounded-xl border border-[#D5CFC1] bg-white font-black text-[#1B4332]"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              {isYearClosed && (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-slate-800 text-white flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Book Closed
                </span>
              )}

              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={printReport}
                  className="px-3.5 py-2 text-xs font-black rounded-xl border border-[#D5CFC1] text-[#1B4332] hover:bg-[#EAF4EC] cursor-pointer flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Report
                </button>
                <button
                  type="button"
                  onClick={() => setShowDividends(true)}
                  className="px-3.5 py-2 text-xs font-black rounded-xl border border-[#D5CFC1] text-[#1B4332] hover:bg-[#EAF4EC] cursor-pointer flex items-center gap-1"
                >
                  <Calculator className="w-3.5 h-3.5" /> Dividends Calculator
                </button>
                {isTreasurerOrOfficer && onCloseDecemberBook && !isYearClosed && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Close the ${reportYear} financial book? No further modifications can be made for ${reportYear}.`)) {
                        onCloseDecemberBook(reportYear);
                      }
                    }}
                    className="px-3.5 py-2 text-xs font-black rounded-xl bg-slate-800 text-white hover:bg-slate-900 cursor-pointer flex items-center gap-1"
                  >
                    <Lock className="w-3.5 h-3.5" /> Close {reportYear} Book
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="py-2.5 pr-3 font-black">Quarter Period</th>
                    <th className="py-2.5 pr-3 text-right font-black">Units / Heads Sold</th>
                    <th className="py-2.5 pr-3 text-right font-black">Gross Revenue</th>
                    <th className="py-2.5 pr-3 text-right font-black">Expenses</th>
                    <th className="py-2.5 text-right font-black">Net Proceeds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {quarters.map((q) => (
                    <tr key={q.name}>
                      <td className="py-2.5 pr-3 font-sans font-black text-[#1B4332]">
                        {q.name} <span className="font-semibold text-slate-500">({q.label})</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right">{q.units}</td>
                      <td className="py-2.5 pr-3 text-right text-emerald-700">{peso(q.rev)}</td>
                      <td className="py-2.5 pr-3 text-right text-rose-700">{peso(q.exp)}</td>
                      <td className={`py-2.5 text-right font-black ${q.net >= 0 ? 'text-[#1B4332]' : 'text-rose-700'}`}>
                        {peso(q.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-mono font-black text-sm">
                    <td className="py-3 pr-3 font-sans text-[#1B4332]">Annual Total ({reportYear})</td>
                    <td className="py-3 pr-3 text-right">{yearTotals.units}</td>
                    <td className="py-3 pr-3 text-right text-emerald-700">{peso(yearTotals.rev)}</td>
                    <td className="py-3 pr-3 text-right text-rose-700">{peso(yearTotals.exp)}</td>
                    <td className="py-3 text-right text-[#1B4332]">{peso(yearTotals.rev - yearTotals.exp)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 5. MODAL: ADD / EDIT EXPENSE                                              */}
      {/* ========================================================================= */}
      {showExpenseModal && (
        <Modal
          title={editingExpense ? `Edit Expense — ${selected}` : `Add Expense — ${selected}`}
          onClose={() => setShowExpenseModal(false)}
        >
          <form onSubmit={submitExpense} className="space-y-3.5 text-left">
            {/* Stage Selector */}
            {isSwine && (
              <div>
                <label className={labelCls}>Swine Stage / Classification</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Fattening', 'Breeding', 'Dispersal'] as HogStage[]).map((stg) => (
                    <button
                      key={stg}
                      type="button"
                      onClick={() => setExpStage(stg)}
                      aria-pressed={expStage === stg}
                      className={`min-h-11 py-2 text-sm font-bold rounded-lg border cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
                        expStage === stg ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'bg-white text-[#1B4332] border-[#D5CFC1]'
                      }`}
                    >
                      {stg}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isCattle && (
              <div>
                <label className={labelCls}>Cattle Stage / Classification</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['Fattening', 'Dispersal'] as HogStage[]).map((stg) => (
                    <button
                      key={stg}
                      type="button"
                      onClick={() => setExpStage(stg)}
                      aria-pressed={expStage === stg}
                      className={`min-h-11 py-2 text-sm font-bold rounded-lg border cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
                        expStage === stg ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'bg-white text-[#1B4332] border-[#D5CFC1]'
                      }`}
                    >
                      {stg === 'Fattening' ? 'Cattle Fattening' : 'Cattle Dispersal'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isPoultry && (
              <div>
                <label className={labelCls}>Poultry Classification</label>
                <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-xs font-black text-[#1B4332]">
                  Ready-to-Lay (RTL) Layer Portfolio
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Expense Category</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className={inputCls}
              >
                {getExpenseCategories(selected).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {expCategory === 'Other' && (
              <div>
                <label className={labelCls}>Specify Custom Category</label>
                <input
                  type="text"
                  required
                  value={expCustom}
                  onChange={(e) => setExpCustom(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Veterinary Inspection, Equipment Hire"
                />
              </div>
            )}

            {/* Heads purchased: only for stock-purchase categories */}
            {(isSwine || isCattle || isPoultry) && STOCK_CATEGORIES.includes(expCategory) && (
              <div>
                <label className={labelCls}>Heads Purchased</label>
                <input
                  type="number"
                  min={0}
                  value={expQty}
                  onChange={(e) => setExpQty(e.target.value)}
                  className={inputCls}
                  placeholder="Quantity"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Amount (₱)</label>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className={inputCls}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={labelCls}>Disbursement Date</label>
                <input
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Description / Purpose</label>
              <input
                type="text"
                required
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                className={inputCls}
                placeholder="Purchase description"
              />
            </div>

            {formError && <p className="text-xs font-bold text-rose-700">{formError}</p>}
            <ModalActions
              onCancel={() => setShowExpenseModal(false)}
              submitLabel={editingExpense ? 'Save Changes' : 'Record Expense'}
            />
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL: ADD / EDIT SALE / REVENUE                                       */}
      {/* ========================================================================= */}
      {showSaleModal && (
        <Modal
          title={editingSale ? `Edit Revenue — ${selected}` : `Add Revenue — ${selected}`}
          onClose={() => setShowSaleModal(false)}
        >
          <form onSubmit={submitSale} className="space-y-3.5 text-left">
            {/* Stage Selector */}
            {isSwine && (
              <div>
                <label className={labelCls}>Swine Stage Sold</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Fattening', 'Breeding', 'Dispersal'] as HogStage[]).map((stg) => (
                    <button
                      key={stg}
                      type="button"
                      onClick={() => setSaleStage(stg)}
                      aria-pressed={saleStage === stg}
                      className={`min-h-11 py-2 text-sm font-bold rounded-lg border cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
                        saleStage === stg ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'bg-white text-[#1B4332] border-[#D5CFC1]'
                      }`}
                    >
                      {stg}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isCattle && (
              <div>
                <label className={labelCls}>Cattle Stage Sold</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['Fattening', 'Dispersal'] as HogStage[]).map((stg) => (
                    <button
                      key={stg}
                      type="button"
                      onClick={() => setSaleStage(stg)}
                      aria-pressed={saleStage === stg}
                      className={`min-h-11 py-2 text-sm font-bold rounded-lg border cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
                        saleStage === stg ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'bg-white text-[#1B4332] border-[#D5CFC1]'
                      }`}
                    >
                      {stg === 'Fattening' ? 'Cattle Fattening' : 'Cattle Dispersal'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isPoultry && (
              <div>
                <label className={labelCls}>What Was Sold?</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([['General', 'Eggs / other income'], ['RTL', 'Birds (reduces RTL count)']] as [HogStage, string][]).map(([stg, label]) => (
                    <button
                      key={stg}
                      type="button"
                      onClick={() => setSaleStage(stg)}
                      aria-pressed={saleStage === stg}
                      className={`min-h-11 py-2 text-sm font-bold rounded-lg border cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 ${
                        saleStage === stg ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'bg-white text-[#1B4332] border-[#D5CFC1]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Quantity Sold / Rental Units</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={saleQty}
                  onChange={(e) => setSaleQty(e.target.value)}
                  className={inputCls}
                  placeholder="Quantity"
                />
              </div>
              <div>
                <label className={labelCls}>Sale / Rental Date</label>
                <input
                  type="date"
                  required
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>
                Total Revenue Collected (₱){saleStage === 'Dispersal' ? ' — leave blank if free' : ''}
              </label>
              <input
                type="number"
                min={saleStage === 'Dispersal' ? 0 : 0.01}
                step="0.01"
                required={saleStage !== 'Dispersal'}
                value={saleRevenue}
                onChange={(e) => setSaleRevenue(e.target.value)}
                className={inputCls}
                placeholder="0.00"
              />
            </div>

            <div>
              <label className={labelCls}>Buyer / Transaction Notes</label>
              <input
                type="text"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                className={inputCls}
                placeholder="Optional"
              />
            </div>

            {formError && <p className="text-xs font-bold text-rose-700">{formError}</p>}
            <ModalActions
              onCancel={() => setShowSaleModal(false)}
              submitLabel={editingSale ? 'Save Changes' : 'Record Revenue'}
            />
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL: ADD IGP PROJECT                                                 */}
      {/* ========================================================================= */}
      {showAddProject && (
        <Modal title="Add New Association IGP Project" onClose={() => setShowAddProject(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addProject(newProject);
            }}
            className="space-y-4 text-left"
          >
            <div>
              <label className={labelCls}>Project Name</label>
              <input
                type="text"
                required
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                className={inputCls}
                placeholder="Enter project name"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700 block">Suggestions</span>
              <div className="flex flex-wrap gap-1.5">
                {['Chairs Rental (Abang sa Lingkoranan)', 'Sacks Rental (Abang sa Sako)', 'Tent & Sound Rental', 'Corn Production'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNewProject(s)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[#D5CFC1] bg-white hover:bg-emerald-50 text-[#1B4332] cursor-pointer"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>

            <ModalActions onCancel={() => setShowAddProject(false)} submitLabel="Register Project" />
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 9. ATTENDANCE DIVIDEND CALCULATOR MODAL                                    */}
      {/* ========================================================================= */}
      <AttendanceDividendCalculatorModal
        isOpen={showDividends}
        onClose={() => setShowDividends(false)}
        members={members}
        meetings={meetings}
        hogRaisingState={state}
      />

    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[70] text-left">
      <div role="dialog" aria-modal="true" aria-labelledby="igp-modal-title" className="bg-[#F7F4EF] border-[#D5CFC1] w-full max-w-4xl rounded-3xl shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 border-b border-[#D5CFC1] pb-3">
          <h3 id="igp-modal-title" className="text-lg font-bold text-[#1B4332]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-[#4A5F57] hover:bg-emerald-50 hover:text-[#1B4332] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, submitLabel }: { onCancel: () => void; submitLabel: string }) {
  return (
    <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 px-4 py-2 text-sm font-bold rounded-xl border-slate-300 bg-slate-100 text-[#1B4332] cursor-pointer hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        className="min-h-11 px-5 py-2 text-sm font-bold rounded-xl bg-[#1B4332] text-white hover:bg-[#143326] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 cursor-pointer shadow-md transition-colors"
      >
        {submitLabel}
      </button>
    </div>
  );
}
