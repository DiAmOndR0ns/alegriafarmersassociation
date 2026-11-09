import React, { useState, useMemo, useEffect } from 'react';
import { FinancialTransaction, OrganizationFund, HogRaisingState, User, OfficerRole, InventoryItem, AssociationActivity } from '../types';
import { resolveOfficerPrefixed } from '../utils/officers';
import { isActivityOpenForExpenses } from '../utils/activityExpenses';
import { getSecureItem, setSecureItem } from '../utils/secureStorage';
import { INITIAL_FUNDS, INITIAL_HOG_RAISING } from '../initialData';
import FinancialStatement from './FinancialStatement';
import { getTreasurerAnalytics } from '../utils/treasurerAnalytics';
import { getInitialFund } from '../utils/fundBalance';
import { 
  Coins, ArrowUpRight, ArrowDownRight, Plus, 
  Search, ShieldCheck, AlertTriangle, CheckCircle, 
  XCircle, Filter, FileText, Info, Building2, Wallet, Database,
  Briefcase, BarChart3, Calendar, Sparkles, Trash2} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface TreasurerViewProps {
  transactions: FinancialTransaction[];
  activities?: AssociationActivity[];
  funds?: OrganizationFund[];
  hogRaising?: HogRaisingState;
  inventory?: InventoryItem[];
  onAddTransaction: (tx: Omit<FinancialTransaction, 'id' | 'auditedStatus'>) => void;
  onDeleteTransaction?: (id: string) => void;
  onAddFund?: (fund: Omit<OrganizationFund, 'id' | 'lastUpdated'>) => void;
  onDeleteFund?: (id: string) => void;
  onOpenReportModal?: () => void;
  users?: User[];
  currentUser?: User;
  currentRole?: OfficerRole;
}

const getFundSourceValue = (fund: OrganizationFund) => `${fund.code} (${fund.name})`;

export default function TreasurerView({
  transactions,
  activities = [],
  funds = INITIAL_FUNDS,
  hogRaising = INITIAL_HOG_RAISING,
  inventory = [],
  onAddTransaction,
  onDeleteTransaction,
  onAddFund,
  onDeleteFund,
  onOpenReportModal,
  users = [],
  currentUser,
  currentRole = 'Treasurer'
}: TreasurerViewProps) {
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterAudit, setFilterAudit] = useState<'all' | 'Unaudited' | 'Audited' | 'Flagged'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // The association's official FINANCIAL STATEMENT (segregated exportable).
  const [showFinancialStatement, setShowFinancialStatement] = useState(false);

  // Financial analytics year filter.
  const [chartYear, setChartYear] = useState<string>('all');

  // Add Transaction Form
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [txCategory, setTxCategory] = useState('Membership Dues');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [txFundSource, setTxFundSource] = useState('');
  const [txFundSourceError, setTxFundSourceError] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txDesc, setTxDesc] = useState('');
  const [txPurpose, setTxPurpose] = useState('');
  const [txActivityId, setTxActivityId] = useState('');
  const [txActivityError, setTxActivityError] = useState('');

  // Add Organization Fund Modal
  const [showAddFundModal, setShowAddFundModal] = useState(false);
  const [fundFormName, setFundFormName] = useState('');
  const [fundFormCode, setFundFormCode] = useState('');
  const [fundFormCategory, setFundFormCategory] = useState('Grant');
  const [fundFormSource, setFundFormSource] = useState('');
  const [fundFormInitialFund, setFundFormInitialFund] = useState('');
  const defaultCustodian = useMemo(() => {
    if (currentRole === 'Assistant_Treasurer') {
      return `Assistant Treasurer ${currentUser?.name || resolveOfficerPrefixed(users, 'Assistant_Treasurer')}`;
    }
    return resolveOfficerPrefixed(users, 'Treasurer' as OfficerRole);
  }, [currentRole, currentUser, users]);
  const [fundFormCustodian, setFundFormCustodian] = useState(defaultCustodian);
  const [fundFormDescription, setFundFormDescription] = useState('');

  // Audit Form

  const CATEGORIES = {
    income: ['Membership Dues', 'Donation', 'Livelihood Assistance', 'Produce Sales', 'Coop Fee', 'Other Income'],
    expense: ['Seeds & Seedlings', 'Fertilizer Depot', 'Equipment Purchase', 'Equipment Maintenance', 'Meeting Snacks & Logistics', 'Honorarium', 'Other Expense']
  };

  useEffect(() => {
    let active = true;
    void getSecureItem<string[]>('bafa_treasurer_categories').then((stored) => {
      if (active && Array.isArray(stored)) setCustomCategories(stored);
    }).catch(() => {
      if (active) setCustomCategories([]);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!funds.some(fund => getFundSourceValue(fund) === txFundSource)) {
      setTxFundSource(funds[0] ? getFundSourceValue(funds[0]) : '');
    }
  }, [funds, txFundSource]);

  const availableCategories = [...CATEGORIES[txType], ...customCategories.filter(category => !CATEGORIES[txType].includes(category))];

  const handleAddCategory = (event: React.FormEvent) => {
    event.preventDefault();
    const category = newCategoryName.trim();
    if (!category || availableCategories.some(existing => existing.toLowerCase() === category.toLowerCase())) return;
    const nextCategories = [...customCategories, category];
    setCustomCategories(nextCategories);
    void setSecureItem('bafa_treasurer_categories', nextCategories).catch(() => undefined);
    setTxCategory(category);
    setNewCategoryName('');
    setShowCategoryModal(false);
  };

  // The analytics year filter covers both association ledger and IGP entries.
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    transactions.forEach(transaction => {
      if (transaction.date && transaction.date.length >= 4) yearsSet.add(transaction.date.substring(0, 4));
    });
    (hogRaising?.expenses || []).forEach(e => {
      if (e.date && e.date.length >= 4) yearsSet.add(e.date.substring(0, 4));
    });
    (hogRaising?.sales || []).forEach(s => {
      if (s.date && s.date.length >= 4) yearsSet.add(s.date.substring(0, 4));
    });
    return Array.from(yearsSet).sort().reverse();
  }, [transactions, hogRaising]);

  const treasurerAnalytics = useMemo(
    () => getTreasurerAnalytics(transactions, hogRaising, activities, funds, chartYear),
    [transactions, hogRaising, activities, funds, chartYear]
  );
  const currentRegisteredFundBalance = funds.reduce((total, fund) => total + (Number(fund.currentBalance) || 0), 0);

  const handleTypeChange = (type: 'income' | 'expense') => {
    setTxType(type);
    setTxCategory(CATEGORIES[type][0]);
    setTxPurpose('');
  };

  const handleAddFundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddFund || !fundFormName.trim() || !fundFormCategory || !fundFormSource.trim()) return;

    const initialFund = parseFloat(fundFormInitialFund) || 0;
    const code = fundFormCode.trim().toUpperCase() ||
                 fundFormName.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 8);

    onAddFund({
      name: fundFormName.trim(),
      code,
      category: fundFormCategory,
      source: fundFormSource.trim(),
      initialFund,
      // A brand-new fund has no ledger yet, so its live balance equals the initial fund.
      currentBalance: initialFund,
      custodian: fundFormCustodian.trim() || resolveOfficerPrefixed(users, 'Treasurer' as OfficerRole),
      description: fundFormDescription.trim() || 'Opisyal nga pundo sa asosasyon'
    });

    // Set this newly created fund as active in the transaction modal
    setTxFundSource(`${code} (${fundFormName.trim()})`);
    setTxFundSourceError('');

    // Reset fund form
    setFundFormName('');
    setFundFormCode('');
    setFundFormCategory('Grant');
    setFundFormSource('');
    setFundFormInitialFund('');
    setFundFormCustodian(defaultCustodian);
    setFundFormDescription('');
    setShowAddFundModal(false);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || parseFloat(txAmount) <= 0 || !txDesc.trim()) return;
    const selectedFund = funds.find(fund => getFundSourceValue(fund) === txFundSource);
    if (!selectedFund) {
      setTxFundSourceError('Choose a registered fund source, or add and register one before recording this transaction.');
      return;
    }
    setTxFundSourceError('');
    if (txType === 'expense' && !txPurpose.trim()) return;
    if (txType === 'expense' && txActivityId) {
      const selectedActivity = activities.find(activity => activity.id === txActivityId);
      if (!selectedActivity || !isActivityOpenForExpenses(selectedActivity)) {
        setTxActivityError('This activity is closed for new expenses. Choose a scheduled or in-progress activity.');
        return;
      }
    }

    const effectivePurpose = txPurpose.trim() || txDesc.trim();
    const liquidationDeadline = txType === 'expense'
      ? new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : undefined;

    onAddTransaction({
      type: txType,
      category: txCategory,
      amount: parseFloat(txAmount),
      date: txDate,
      description: txDesc,
      activityId: txActivityId || undefined,
      purpose: effectivePurpose,
      liquidationDeadline,
      fundSource: getFundSourceValue(selectedFund),
      recordedBy: defaultCustodian
    });

    setTxAmount('');
    setTxDesc('');
    setTxPurpose('');
    setTxActivityId('');
    setTxActivityError('');
    setTxDate(new Date().toISOString().split('T')[0]);
    setShowAddModal(false);
  };

  // Filter Transactions
  const filteredTx = transactions.filter(t => {
    const matchesType = filterType === 'all' || t.type === filterType;
    const matchesAudit = filterAudit === 'all' || t.auditedStatus === filterAudit;
    return matchesType && matchesAudit;
  });
  const [visibleTransactionCount, setVisibleTransactionCount] = useState(10);
  const visibleTx = filteredTx.slice(0, visibleTransactionCount);

  return (
    <div id="treasurer-view-container" className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[#F7F4EF] p-4 rounded-2xl border border-[#D5CFC1]">
        <div>
          <h2 className="text-xl font-bold text-[#1B4332] flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-600" />
            <span>Treasurer Dashboard</span>
            {currentRole === 'Assistant_Treasurer' && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-300">
                Assistant Treasurer Access
              </span>
            )}
          </h2>
          <p className="text-xs text-[#4A5F57] mt-1">
            Manage organization funds, record financial transactions, and generate official statements.
          </p>
        </div>
      </div>

      {/* REGISTERED ORGANIZATION FUNDS & TREASURY ACCOUNTS */}
      <div className="bg-[#F7F4EF] border border-[#D5CFC1] p-5 rounded-2xl space-y-4 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-[#D5CFC1]">
          <div>
            <h3 className="text-sm font-black text-[#1B4332] uppercase tracking-wide flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <span>Registered Organization Fund Accounts & Database Audits</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {onAddFund && (
              <button
                type="button"
                onClick={() => setShowAddFundModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Fund Source</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-3 py-1 rounded-xl text-xs font-semibold">
              <Database className="w-3.5 h-3.5" />
              <span>PostgreSQL Synchronized</span>
            </div>
          </div>
        </div>

        {funds.length === 0 ? (
          <div className="bg-white border border-[#D5CFC1] p-6 rounded-xl text-center space-y-3">
            <Wallet className="w-8 h-8 text-[#5D6B54] mx-auto opacity-60" />
            <p className="text-sm font-bold text-[#1B4332]">No fund accounts are registered.</p>
            <p className="text-xs text-[#4A5F57] max-w-md mx-auto">
              Add a fund source such as DSWD-SLP, Department of Agriculture assistance, local government aid, or member capital build-up to track association funds.
            </p>
            <button
              type="button"
              onClick={() => setShowAddFundModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add the First Fund Source</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {funds.map((fund) => (
              <div key={fund.id} className="bg-white border border-[#D5CFC1] p-4 rounded-xl space-y-2 relative overflow-hidden group hover:border-[#1B4332]/40 transition-all">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 px-2 py-0.5 rounded">
                        {fund.code}
                      </span>
                      <h4 className="font-bold text-[#1B4332] text-sm">{fund.name}</h4>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {fund.category && <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">{fund.category}</span>}
                      {fund.source && <span className="text-[10px] text-slate-600">From: {fund.source}</span>}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{fund.description}</p>
                  </div>
                  {onDeleteFund && (
                    <button
                      type="button"
                      title="Tangtangon kining pundo gikan sa database"
                      onClick={() => {
                        if (confirm(`Sigurado ka ba nga tangtangon kining tinubdan sa pundo: "${fund.name}"?`)) {
                          onDeleteFund(fund.id);
                        }
                      }}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-[#D5CFC1] grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[#4A5F57] block">Allocated Capital</span>
                    <span className="font-mono font-bold text-[#1B4332]">PHP {getInitialFund(fund).toLocaleString('en-US')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-[#4A5F57] block">Audited Live Balance</span>
                    <span className="font-mono font-black text-emerald-700">PHP {fund.currentBalance.toLocaleString('en-US')}</span>
                  </div>
                </div>

                <div className="pt-1.5 flex items-center justify-between text-[11px] text-[#4A5F57] font-medium">
                  <span className="truncate">Custodian: <strong className="text-[#1B4332]">{fund.custodian}</strong></span>
                  <span className="text-[#4A5F57] shrink-0">Updated: {fund.lastUpdated}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ASSOCIATION-WIDE FINANCIAL ANALYTICS */}
      <div className="bg-[#F7F4EF] border border-[#B8CDBE] p-5 sm:p-6 rounded-2xl space-y-6 shadow-lg relative">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-[#B8CDBE]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-emerald-100 border border-emerald-300 rounded-xl">
                <Briefcase className="w-6 h-6 text-emerald-800" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-[#1B4332] flex flex-wrap items-center gap-2">
                  <span>Association Financial Analytics</span>
                  <span className="text-xs uppercase font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
                    Ledger + Livestock IGP
                  </span>
                </h3>
                <p className="text-sm sm:text-base text-[#33473D] mt-1">
                  Income and expenses from every association fund source, linked activities, and livestock projects
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Filters */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <label htmlFor="treasurer-analytics-year" className="flex items-center gap-2 bg-white px-3 py-2.5 rounded-xl border border-[#8FA99A] text-sm">
              <Calendar className="w-5 h-5 text-[#1B4332]" aria-hidden="true" />
              <span className="text-[#1B4332] font-bold">Show year:</span>
              <select
                id="treasurer-analytics-year"
                value={chartYear}
                onChange={(e) => setChartYear(e.target.value)}
                className="min-h-11 bg-transparent text-[#1B4332] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F] cursor-pointer"
              >
                <option value="all" className="bg-white text-[#1B4332]">All Years</option>
                {availableYears.map(y => (
                  <option key={y} value={y} className="bg-white text-[#1B4332]">{y}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* SUMMARY KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-[#B8CDBE] p-4 sm:p-5 rounded-xl shadow-sm">
            <span className="text-sm font-bold text-[#33473D] uppercase tracking-wide block">Total Income</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-800 font-mono mt-1">
              PHP {treasurerAnalytics.totalIncome.toLocaleString('en-US')}
            </div>
            <span className="text-sm text-[#33473D] mt-1.5 block">
              Association ledger + livestock IGP
            </span>
          </div>

          <div className="bg-white border border-[#B8CDBE] p-4 sm:p-5 rounded-xl shadow-sm">
            <span className="text-sm font-bold text-[#33473D] uppercase tracking-wide block">Total Expenses</span>
            <div className="text-xl sm:text-2xl font-black text-rose-800 font-mono mt-1">
              PHP {treasurerAnalytics.totalExpenses.toLocaleString('en-US')}
            </div>
            <span className="text-sm text-[#33473D] mt-1.5 block">
              Recorded expenses + livestock costs
            </span>
          </div>

          <div className="bg-white border border-[#B8CDBE] p-4 sm:p-5 rounded-xl shadow-sm">
            <span className="text-sm font-bold text-[#33473D] uppercase tracking-wide block">Net Cash Flow</span>
            <div className={`text-xl sm:text-2xl font-black font-mono mt-1 ${treasurerAnalytics.totalIncome - treasurerAnalytics.totalExpenses >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
              {treasurerAnalytics.totalIncome >= treasurerAnalytics.totalExpenses ? '+' : ''}PHP {(treasurerAnalytics.totalIncome - treasurerAnalytics.totalExpenses).toLocaleString('en-US')}
            </div>
            <span className="text-sm text-[#33473D] mt-1.5 block">
              {funds.length} registered sources · PHP {currentRegisteredFundBalance.toLocaleString('en-US')} balance
            </span>
          </div>

        </div>

        {/* RECHARTS BAR CHART CANVAS */}
        {treasurerAnalytics.months.length > 0 ? (
          <div className="space-y-4">
            <div className="h-[340px] sm:h-[380px] w-full bg-white p-3 sm:p-5 rounded-xl border border-[#B8CDBE]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={treasurerAnalytics.months}
                  margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#D5CFC1" vertical={false} opacity={0.8} />
                  <XAxis
                    dataKey="shortMonth"
                    stroke="#647A6E"
                    tick={{ fill: '#33473D', fontSize: 14, fontWeight: 600 }}
                    tickLine={{ stroke: '#B8CDBE' }}
                  />
                  <YAxis
                    stroke="#647A6E"
                    tick={{ fill: '#33473D', fontSize: 14 }}
                    tickLine={{ stroke: '#B8CDBE' }}
                    tickFormatter={(val) => `₱${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border border-[#8FA99A] p-4 rounded-xl shadow-lg text-sm space-y-3 min-w-[240px]">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#B8CDBE] pb-2">
                              <span className="font-bold text-[#1B4332] text-sm">{data.monthLabel}</span>
                              <span className="text-xs font-mono text-emerald-900 font-bold bg-emerald-100 px-2 py-1 rounded border border-emerald-300">
                                Association + IGP
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center gap-4">
                                <span className="text-emerald-800 flex items-center gap-1.5 font-medium">
                                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                                  Income:
                                </span>
                                <span className="font-mono font-bold text-emerald-800">
                                  PHP {Number(data.income).toLocaleString('en-US')}
                                </span>
                              </div>

                              <div className="flex justify-between items-center gap-4">
                                <span className="text-rose-800 flex items-center gap-1.5 font-medium">
                                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                                  Expenses:
                                </span>
                                <span className="font-mono font-bold text-rose-800">
                                  PHP {Number(data.expenses).toLocaleString('en-US')}
                                </span>
                              </div>

                              {data.associationIncome > 0 && (
                                <div className="pl-4 text-sm text-[#33473D] flex justify-between">
                                  <span>• Association income:</span>
                                  <span className="font-mono">PHP {data.associationIncome.toLocaleString('en-US')}</span>
                                </div>
                              )}
                              {data.igpIncome > 0 && (
                                <div className="pl-4 text-sm text-[#33473D] flex justify-between">
                                  <span>• Livestock IGP income:</span>
                                  <span className="font-mono">PHP {data.igpIncome.toLocaleString('en-US')}</span>
                                </div>
                              )}
                              {data.associationExpenses > 0 && (
                                <div className="pl-4 text-sm text-[#33473D] flex justify-between">
                                  <span>• Association expenses:</span>
                                  <span className="font-mono">PHP {data.associationExpenses.toLocaleString('en-US')}</span>
                                </div>
                              )}
                              {data.igpExpenses > 0 && (
                                <div className="pl-4 text-sm text-[#33473D] flex justify-between">
                                  <span>• Livestock IGP expenses:</span>
                                  <span className="font-mono">PHP {data.igpExpenses.toLocaleString('en-US')}</span>
                                </div>
                              )}
                            </div>

                            <div className="pt-2 border-t border-[#D5CFC1] flex justify-between items-center gap-4">
                              <span className="text-[#1B4332] font-semibold">Net Cash Flow:</span>
                              <span className={`font-mono font-bold ${data.net >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                                {data.net >= 0 ? '+' : ''}PHP {Number(data.net).toLocaleString('en-US')}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '14px' }}
                    formatter={(value) => <span className="text-[#1B4332] font-semibold text-sm mr-3">{value}</span>}
                  />
                  <Bar
                    dataKey="income"
                    name="Total Income"
                    fill="#10B981"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                  />
                  <Bar
                    dataKey="expenses"
                    name="Total Expenses"
                    fill="#F43F5E"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* MONTHLY SUMMARY CHIPS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 pt-1">
              {treasurerAnalytics.months.map((m) => (
                <div key={m.monthKey} className="bg-white border border-[#B8CDBE] p-3.5 rounded-xl space-y-2 text-sm shadow-sm">
                  <span className="font-bold text-[#1B4332] block text-base">{m.shortMonth}</span>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-emerald-800 font-mono">Income: +{m.income >= 1000 ? `${(m.income/1000).toFixed(0)}k` : m.income}</span>
                    <span className="text-rose-800 font-mono">Expenses: -{m.expenses >= 1000 ? `${(m.expenses/1000).toFixed(0)}k` : m.expenses}</span>
                  </div>
                  <div className={`text-sm font-mono font-bold px-2 py-1 rounded text-center ${
                    m.net >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    Net: {m.net >= 0 ? '+' : ''}₱{Math.abs(m.net).toLocaleString('en-US')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[#EAF6EE] border border-[#83C99A] p-8 sm:p-10 rounded-xl text-center space-y-3">
            <BarChart3 className="w-10 h-10 text-[#1B5E3B] mx-auto" aria-hidden="true" />
            <p className="text-base sm:text-lg font-bold text-[#1B4332]">No financial activity recorded for the selected year.</p>
            <p className="text-base text-[#2B3D33]">Choose another year or record an association transaction or livestock sale/expense.</p>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white border border-[#B8CDBE] rounded-xl p-4 sm:p-5 shadow-sm">
            <h4 className="text-base sm:text-lg font-bold text-[#1B4332] mb-4">Expenses linked to activities</h4>
            {treasurerAnalytics.eventExpenses.length ? (
              <div className="space-y-4">
                {treasurerAnalytics.eventExpenses.map(item => (
                  <div key={item.name} className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-3 text-base">
                      <span className="text-[#243B31] break-words">{item.name}</span>
                      <span className="text-rose-800 font-mono font-bold shrink-0">PHP {item.expenses.toLocaleString('en-US')}</span>
                    </div>
                    <div className="h-3 bg-[#E4EBE6] rounded-full overflow-hidden" aria-hidden="true">
                      <div
                        className="h-full bg-rose-700 rounded-full"
                        style={{ width: `${Math.min(100, item.expenses / Math.max(...treasurerAnalytics.eventExpenses.map(event => event.expenses)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-base text-[#33473D]">No ledger expenses are linked to activities in this period.</p>}
          </div>

          <div className="bg-white border border-[#B8CDBE] rounded-xl p-4 sm:p-5 shadow-sm">
            <h4 className="text-base sm:text-lg font-bold text-[#1B4332] mb-4">Livestock project expenses</h4>
            {treasurerAnalytics.livestockExpenses.length ? (
              <div className="space-y-4">
                {treasurerAnalytics.livestockExpenses.map(item => (
                  <div key={item.name} className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-3 text-base">
                      <span className="text-[#243B31] break-words">{item.name}</span>
                      <span className="text-amber-800 font-mono font-bold shrink-0">PHP {item.expenses.toLocaleString('en-US')}</span>
                    </div>
                    <div className="h-3 bg-[#E4EBE6] rounded-full overflow-hidden" aria-hidden="true">
                      <div
                        className="h-full bg-amber-700 rounded-full"
                        style={{ width: `${Math.min(100, item.expenses / Math.max(...treasurerAnalytics.livestockExpenses.map(expense => expense.expenses)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-base text-[#33473D]">No livestock expenses are recorded in this period.</p>}
          </div>
        </div>

        <div className="bg-white border border-[#B8CDBE] rounded-xl p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
            <h4 className="text-base sm:text-lg font-bold text-[#1B4332]">All fund sources</h4>
            <span className="text-sm text-[#33473D]">Registered balances and recorded transaction flows</span>
          </div>
          {treasurerAnalytics.fundSources.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {treasurerAnalytics.fundSources.map(source => (
                <div key={source.id} className="bg-[#F7F9F7] border border-[#B8CDBE] rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-bold text-[#1B4332] break-words">{source.name}</span>
                    <span className={`text-xs uppercase font-bold px-2 py-1 rounded shrink-0 ${source.registered ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
                      {source.registered ? 'Registered' : 'Unregistered'}
                    </span>
                  </div>
                  {(source.category || source.source) && (
                    <div className="mt-2 space-y-1 text-sm text-[#33473D]">
                      {source.category && <p>Category: <span className="font-semibold text-emerald-900">{source.category}</span></p>}
                      {source.source && <p>From: <span className="font-semibold text-[#243B31]">{source.source}</span></p>}
                    </div>
                  )}
                  {source.registered && (
                    <div className="text-sm text-[#33473D] mt-3">
                      Current balance: <span className="font-mono font-bold text-[#1B4332]">PHP {(source.balance || 0).toLocaleString('en-US')}</span>
                      <span className="text-[#52665C]"> / PHP {(source.allocated || 0).toLocaleString('en-US')} allocated</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm font-semibold">
                    <span className="text-emerald-900">Income: PHP {source.income.toLocaleString('en-US')}</span>
                    <span className="text-rose-900">Expenses: PHP {source.expenses.toLocaleString('en-US')}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-base text-[#33473D]">No registered or transaction fund sources are available.</p>}
        </div>
      </div>

      {/* OFFICER SUMMARY DESCRIPTION AND TOOLS */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-[#F7F4EF] p-4 sm:p-5 rounded-2xl border border-[#B8CDBE]">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-[#1B4332] flex items-center gap-2">
            <Coins className="w-6 h-6 text-emerald-800" />
            <span>Treasurer Financial Ledger</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:flex items-stretch gap-3 w-full xl:w-auto">
          {/* SEGREGATED EXPORTABLE — the association's official FINANCIAL STATEMENT format,
              kept separate from the Treasurer's other exports (OfficerReportModal etc.). */}
          <button
            id="treasurer-financial-statement-btn"
            type="button"
            onClick={() => setShowFinancialStatement(true)}
            className="flex min-h-14 items-center justify-center gap-2 px-4 py-3 text-base font-bold bg-[#14532D] hover:bg-[#123F25] text-white border border-[#14532D] rounded-xl shadow-sm transition-all w-full xl:w-auto cursor-pointer focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2D6A4F]"
          >
            <FileText className="w-5 h-5 shrink-0" />
            <span>Financial Statement (Official Format)</span>
          </button>

          {onOpenReportModal && (
            <button
              id="treasurer-report-btn"
              type="button"
              onClick={onOpenReportModal}
              className="flex min-h-14 items-center justify-center gap-2 px-4 py-3 text-base font-bold bg-white hover:bg-emerald-50 text-[#14532D] border border-[#2D6A4F] rounded-xl shadow-sm transition-all w-full xl:w-auto cursor-pointer focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2D6A4F]"
            >
              <FileText className="w-5 h-5 shrink-0" />
              <span>Export Financial Report</span>
            </button>
          )}

          <button
            id="record-tx-btn"
            onClick={() => setShowAddModal(true)}
            className="flex min-h-14 items-center justify-center gap-2 px-4 py-3 text-base font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-sm transition-all w-full xl:w-auto focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2D6A4F]"
          >
            <Plus className="w-5 h-5" />
            <span>Log Transaction</span>
          </button>
        </div>
      </div>

      {/* FILTER & LEDGER LIST */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#EAF6EE] p-4 rounded-xl border border-[#B8CDBE]">
          <div className="flex items-center gap-2 text-base font-bold text-[#1B4332] uppercase shrink-0">
            <Filter className="w-5 h-5" />
            <span>Filters:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              aria-label="Filter transactions by type"
              className="min-h-12 px-4 py-2 text-base bg-white border border-[#8FA99A] rounded-lg text-[#1B4332] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
            >
              <option value="all">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expenses Only</option>
            </select>

            <select
              value={filterAudit}
              onChange={(e) => setFilterAudit(e.target.value as any)}
              aria-label="Filter transactions by audit status"
              className="min-h-12 px-4 py-2 text-base bg-white border border-[#8FA99A] rounded-lg text-[#1B4332] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
            >
              <option value="all">All Audit Statuses</option>
              <option value="Unaudited">Unaudited</option>
              <option value="Audited">Audited</option>
              <option value="Flagged">Flagged / Action Required</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredTx.length > 0 ? (
            visibleTx.map((tx) => (
              <div
                key={tx.id}
                className={`bg-slate-800 border rounded-2xl p-4.5 transition-all shadow-sm flex flex-col md:flex-row justify-between gap-4 ${
                  tx.auditedStatus === 'Flagged'
                    ? 'border-rose-300 bg-rose-50'
                    : tx.auditedStatus === 'Audited'
                    ? 'border-emerald-500/10'
                    : 'border-slate-700/50'
                }`}
              >
                {/* LHS: Info */}
                <div className="flex items-start gap-3.5">
                  <div className={`p-2.5 rounded-xl shrink-0 border ${
                    tx.type === 'income'
                      ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-950/40 border-rose-500/20 text-rose-400'
                  }`}>
                    {tx.type === 'income' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-semibold text-slate-400 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-700">
                        {tx.category}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">{tx.date}</span>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                        <Wallet className="w-2.5 h-2.5" />
                        <span>
                          {tx.type === 'income' ? 'Deposited To: ' : 'Budget Source: '}
                          {tx.fundSource || 'General Operational Fund'}
                        </span>
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white mt-1.5">{tx.description}</p>
                    {tx.purpose && (
                      <p className="text-[11px] text-amber-200 mt-1.5">
                        <span className="font-semibold text-amber-300">Purpose:</span> {tx.purpose}
                      </p>
                    )}
                    {tx.activityId && (
                      <p className="text-[11px] text-sky-200 mt-1">
                        Activity: {activities.find(activity => activity.id === tx.activityId)?.title || 'Activity no longer listed'}
                      </p>
                    )}
                    {tx.liquidationDeadline && (
                      <p className="text-[10px] text-amber-300 mt-1">
                        Liquidation due by {tx.liquidationDeadline} • 20-day rule
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1">Logged by: {tx.recordedBy}</p>

                    {/* Audit Details Sub-Block */}
                    {tx.auditedStatus !== 'Unaudited' && (
                      <div className={`mt-3 p-2.5 rounded-xl text-xs border ${
                        tx.auditedStatus === 'Flagged'
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}>
                        <div className="flex items-center gap-1.5 font-bold mb-0.5">
                          {tx.auditedStatus === 'Flagged' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          )}
                          <span>
                            {tx.auditedStatus === 'Flagged' ? 'Audit Note / Flagged' : 'Audited and Approved'}
                          </span>
                        </div>
                        <p className="leading-relaxed text-slate-700 italic">"{tx.auditNotes}"</p>
                        <p className="text-[9px] text-slate-500 mt-1 font-mono">
                          By: {tx.auditedBy} on {tx.auditedDate}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* RHS: Value and Action */}
                <div className="flex md:flex-col justify-between items-end gap-3 shrink-0 border-t md:border-t-0 border-slate-750 pt-3 md:pt-0">
                  <div className={`text-lg font-bold font-mono ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tx.type === 'income' ? '+' : '-'} PHP {tx.amount.toLocaleString()}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Display Audit Status Badge to Treasurer */}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      tx.auditedStatus === 'Audited'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : tx.auditedStatus === 'Flagged'
                        ? 'bg-red-500/10 text-red-400 animate-pulse'
                        : 'bg-slate-700 text-slate-400'
                    }`}>
                      {tx.auditedStatus}
                    </span>
                    {onDeleteTransaction && currentRole !== 'Treasurer' && currentRole !== 'Assistant_Treasurer' && (
                      <button
                        id={`delete-tx-${tx.id}`}
                        onClick={() => {
                          if (window.confirm(`Delete transaction "${tx.description}" (PHP ${tx.amount.toLocaleString()})? Changes will auto-sync to the database.`)) {
                            onDeleteTransaction(tx.id);
                          }
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Delete transaction record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-8 text-center text-slate-500">
              No transactions match selected filter.
            </div>
          )}
          {visibleTransactionCount < filteredTx.length && (
            <div className="flex items-center justify-between rounded-xl border-[#D5CFC1] bg-white p-3">
              <span className="text-xs font-semibold text-[#33473D]">Showing {visibleTx.length} of {filteredTx.length} records</span>
              <button type="button" onClick={() => setVisibleTransactionCount(count => count + 10)} className="rounded-lg bg-[#1B4332] px-3 py-2 text-xs font-bold text-white">Load 10 more</button>
            </div>
          )}
        </div>
      </div>

      {/* TREASURER ADD TRANSACTION MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className={`px-4 py-2 border-b flex justify-between items-center shrink-0 ${
              txType === 'income'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50 border-rose-200'
            }`}>
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className={`p-1.5 rounded-xl border shrink-0 ${
                  txType === 'income'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                  {txType === 'income' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <h3 style={{ color: '#1B4332' }} className="font-bold text-base leading-snug break-words">
                    {txType === 'income' ? 'Record Income' : 'Record Expense'}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                }}
                className="text-[#33473D] hover:text-[#1B4332] text-2xl font-bold p-1 shrink-0 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-3.5 space-y-2.5 overflow-y-auto">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-bold text-[#18372D] uppercase mb-1 flex items-center justify-between">
                  <span>Transaction Type</span>
                  <span className={`text-[10px] font-black ${txType === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {txType === 'income' ? '● (INFLOW / DEPOSIT)' : '● (OUTFLOW / DISBURSEMENT)'}
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-750">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('income')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      txType === 'income'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Income</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange('expense')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      txType === 'expense'
                        ? 'bg-rose-700 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Expenditure</span>
                  </button>
                </div>
              </div>

              {/* Amount and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                    {txType === 'income' ? 'Amount Received (PHP)' : 'Amount Spent (PHP)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-slate-400 font-mono text-sm">₱</span>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      className="w-full pl-8 pr-3.5 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                    {txType === 'income' ? 'Date Received' : 'Date Paid'}
                  </label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                  {txType === 'income' ? 'Income Category' : 'Expense Category'}
                </label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                >
                  {availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setShowCategoryModal(true)} className="shrink-0 inline-flex items-center gap-1 rounded-xl border-[#2D6A4F] bg-[#EAF6EE] px-3 py-2 text-sm font-bold text-[#1B4332] hover:bg-[#D6EFD9]" aria-label="Add a custom transaction category" title="Add a custom category">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Add category</span>
                </button>
                <p className="mt-1 text-xs text-[#4B6259] hidden">Choose a category or add one for this role, such as Budget Source Allocation.</p>
              </div>

              <div>
                <label htmlFor="transaction-activity" className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                  Association activity (optional)
                </label>
                <select
                  id="transaction-activity"
                  value={txActivityId}
                  onChange={(e) => {
                    setTxActivityId(e.target.value);
                    setTxActivityError('');
                  }}
                  className="w-full px-3.5 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Not linked to an activity</option>
                  {activities.filter(activity => txType !== 'expense' || isActivityOpenForExpenses(activity)).map(activity => (
                    <option key={activity.id} value={activity.id}>
                      {activity.title} — {activity.status} ({activity.scheduledDate})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[#33473d]">
                  {txType === 'expense'
                    ? 'Expenses can be linked only while an activity is scheduled or in progress. Mark it Completed in the PIO activity manager to close it to new expenses.'
                    : 'Link this entry to an activity to include it in activity-level financial reporting.'}
                </p>
                {txActivityError && <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">{txActivityError}</p>}
              </div>

              {/* Fund Account Selection (Deposit Destination for Income, Budget Source for Expense) */}
              <div className="space-y-1.5 bg-[#EAF4EC] p-2.5 rounded-xl border border-[#D5CFC1]">
                <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-[#1B4332] uppercase">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Wallet className={`w-3.5 h-3.5 shrink-0 ${txType === 'income' ? 'text-emerald-700' : 'text-rose-700'}`} />
                    <span className={`break-words ${txType === 'income' ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {txType === 'income'
                        ? 'Deposit Destination (Where the income goes)'
                        : 'Budget Source (Where the fund is taken from)'}
                    </span>
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                    txType === 'income'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}>
                    {txType === 'income' ? 'Deposit Destination' : 'Source Account'}
                  </span>
                </label>
                <p className="text-[11px] text-[#33473d] hidden">
                  {txType === 'income'
                    ? 'Select the fund or bank account where this income will be deposited.'
                    : 'Select the fund or budget source for this expense to maintain an audit trail.'}
                </p>

                <div className="flex flex-col gap-2 pt-1">
                  <select
                    required
                    value={txFundSource}
                    onChange={(e) => {
                      setTxFundSource(e.target.value);
                      setTxFundSourceError('');
                    }}
                    className="w-full min-h-12 px-3.5 py-2 text-base bg-white border border-[#8FA99A] rounded-xl text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
                  >
                    <option value="" disabled>
                      {funds.length ? 'Select a registered fund source' : 'No registered fund sources yet'}
                    </option>
                    {funds.map(fund => (
                      <option key={fund.id} value={getFundSourceValue(fund)}>
                        {txType === 'income' ? 'Deposit to: ' : 'Expense from: '}
                        {fund.code} - {fund.name} (Balance: PHP {fund.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>

                  {txFundSourceError && <p role="alert" className="text-sm font-bold text-rose-800">{txFundSourceError}</p>}
                  {!funds.length && (
                    <p className="text-sm text-[#33473D]">
                      Register a fund source before recording income or expenses.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => onAddFund && setShowAddFundModal(true)}
                    disabled={!onAddFund}
                    title="Register a new fund source"
                    className="w-full min-h-12 py-2.5 bg-[#1B4332] hover:bg-[#123326] disabled:bg-slate-400 disabled:cursor-not-allowed rounded-xl text-base font-bold text-white border border-[#2D6A4F] flex items-center justify-center gap-2 transition-all cursor-pointer focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2D6A4F]"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Register New Budget Source</span>
                  </button>
                </div>
              </div>

              {/* Purpose of Funds */}
              <div>
                <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                  {txType === 'income'
                    ? 'Purpose of funds / official note'
                    : 'Purpose of funds / cash advance purpose'}
                </label>
                <textarea
                  rows={2}
                  required={txType === 'expense'}

                  value={txPurpose}
                  onChange={(e) => setTxPurpose(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
                <p className="mt-1 text-[11px] text-[#33473d]">
                  {txType === 'expense'
                    ? 'Cash advances must be liquidated within 20 calendar days from release. Attach receipts and supporting documents before the deadline.'
                    : 'Describe the purpose of the funds received or deposited for clear audit trail and accountability.'}
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                  {txType === 'income'
                    ? 'Official Receipt / Collection Note'
                    : 'Voucher / Expense Receipt Note'}
                </label>
                <textarea
                  rows={3}
                  required

                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="pt-0.5 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                  }}
                  style={{ color: '#1B4332' }}
                  className="flex-1 py-2.5 text-sm font-bold bg-white hover:bg-[#F5F8F4] border-2 border-[#B8CDBE] hover:border-[#1B4332] rounded-xl transition-all cursor-pointer"
                >
                  Kanselahon (Cancel)
                </button>
                <button
                  type="submit"
                  style={{ color: '#ffffff' }}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === 'income'
                      ? 'bg-[#1B4332] hover:bg-[#123326]'
                      : 'bg-[#8D2300] hover:bg-[#6B1B00]'
                  }`}
                >
                  {txType === 'income' ? <ArrowUpRight className="w-4 h-4" style={{ color: '#ffffff' }} /> : <ArrowDownRight className="w-4 h-4" style={{ color: '#ffffff' }} />}
                  <span>
                    {txType === 'income' ? 'I-rekord ang Kita (Deposit Income)' : 'I-rekord ang Gasto (Disburse Expense)'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CUSTOM CATEGORY MODAL */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10261D]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="add-category-title">
          <form onSubmit={handleAddCategory} className="w-full max-w-md rounded-2xl border-[#B8CDBE] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 id="add-category-title" className="text-lg font-black text-[#1B4332]">Add transaction category</h3>
                <p className="mt-1 text-sm text-[#4B6259]">This category is saved for the assigned finance officer on this device.</p>
              </div>
              <button type="button" onClick={() => setShowCategoryModal(false)} className="rounded-lg px-2 py-1 text-2xl leading-none text-[#4B6259] hover:bg-[#EAF6EE]" aria-label="Close add category dialog">×</button>
            </div>
            <label htmlFor="new-transaction-category" className="mb-1 block text-sm font-bold text-[#18372D]">Category name</label>
            <input id="new-transaction-category" type="text" required maxLength={80} autoFocus value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="w-full rounded-xl border-[#B8CDBE] bg-white px-3 py-2.5 text-[#18372D] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCategoryModal(false)} className="rounded-xl border-[#B8CDBE] px-4 py-2 text-sm font-bold text-[#1B4332] hover:bg-[#F5F8F4]">Cancel</button>
              <button type="submit" className="rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-bold text-white hover:bg-[#123326]">Save category</button>
            </div>
          </form>
        </div>
      )}

      {/* ADD ORGANIZATION FUND MODAL */}
      {showAddFundModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Add Budget Source</h3>
                </div>              </div>
              <button
                onClick={() => setShowAddFundModal(false)}
                className="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddFundSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                Fund Account Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fundFormName}
                  onChange={(e) => setFundFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fund-source-category" className="block text-xs font-bold text-slate-200 uppercase mb-1">
                    Source Category <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id="fund-source-category"
                    required
                    value={fundFormCategory}
                    onChange={(e) => setFundFormCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option>Grant</option>
                    <option>Government Program</option>
                    <option>Donation / Sponsorship</option>
                    <option>Association Funds</option>
                    <option>Cooperative / Bank</option>
                    <option>Member Contribution</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="fund-source-origin" className="block text-xs font-bold text-slate-200 uppercase mb-1">
                    Where is it from? <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="fund-source-origin"
                    type="text"
                    required
                    maxLength={120}
                    value={fundFormSource}
                    onChange={(e) => setFundFormSource(e.target.value)}
                    placeholder="e.g. Department of Labor and Employment"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                    Fund Code / Tag
                  </label>
                  <input
                    type="text"
                    value={fundFormCode}
                    onChange={(e) => setFundFormCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white uppercase font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                    Custodian
                  </label>
                  <input
                    type="text"
                    required
                    value={fundFormCustodian}
                    onChange={(e) => setFundFormCustodian(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                    Initial Fund (PHP)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={fundFormInitialFund}
                    onChange={(e) => setFundFormInitialFund(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#18372D] uppercase mb-1">
                  Description & Purpose
                </label>
                <textarea
                  rows={2}
                  value={fundFormDescription}
                  onChange={(e) => setFundFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddFundModal(false)}
                  className="flex-1 py-2.5 text-sm font-bold bg-white hover:bg-[#F5F8F4] text-[#1B4332] border-2 border-[#B8CDBE] hover:border-[#1B4332] rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ color: '#ffffff' }}
                  className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B4332] hover:bg-[#123326] rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" style={{ color: '#ffffff' }} />
                  <span>Save Fund</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
         {/* THE ASSOCIATION'S OFFICIAL FINANCIAL STATEMENT — segregated exportable,
          separate from the Treasurer's other report exports. */}
      {showFinancialStatement && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-4 no-print">
          <div className="mx-auto max-w-5xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex justify-end gap-2 no-print">
              <button type="button" onClick={() => window.print()} className="rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-bold text-white">Print / Save PDF</button>
              <button type="button" onClick={() => setShowFinancialStatement(false)} className="rounded-xl border-[#D5CFC1] px-4 py-2 text-sm font-bold text-[#1B4332]">Close</button>
            </div>
            <FinancialStatement
              transactions={transactions}
              activities={activities}
              funds={funds}
              hogRaising={hogRaising}
              inventory={inventory}
              users={users}
              year={new Date().getFullYear()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
