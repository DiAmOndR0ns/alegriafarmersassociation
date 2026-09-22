import React, { useState, useMemo, useEffect } from 'react';
import { FinancialTransaction, OfficerRole, OrganizationFund, HogRaisingState } from '../types';
import { INITIAL_FUNDS, INITIAL_HOG_RAISING } from '../initialData';
import { 
  Coins, ArrowUpRight, ArrowDownRight, Plus, 
  Search, ShieldCheck, AlertTriangle, CheckCircle, 
  XCircle, Filter, FileText, Info, Building2, Wallet, Database,
  Briefcase, TrendingUp, BarChart3, Calendar, Sparkles, Trash2} from 'lucide-react';
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
  funds?: OrganizationFund[];
  hogRaising?: HogRaisingState;
  onAddTransaction: (tx: Omit<FinancialTransaction, 'id' | 'auditedStatus'>) => void;
  onDeleteTransaction?: (id: string) => void;
  onAuditTransaction: (id: string, status: 'Audited' | 'Flagged', notes: string) => void;
  onUpdateCapitalGrant?: (amount: number) => void;
  onAddFund?: (fund: Omit<OrganizationFund, 'id' | 'lastUpdated'>) => void;
  onDeleteFund?: (id: string) => void;
  currentRole: OfficerRole;
  onOpenReportModal?: () => void;
}

export default function TreasurerView({
  transactions,
  funds = INITIAL_FUNDS,
  hogRaising = INITIAL_HOG_RAISING,
  onAddTransaction,
  onDeleteTransaction,
  onAuditTransaction,
  onUpdateCapitalGrant,
  onAddFund,
  onDeleteFund,
  currentRole,
  onOpenReportModal
}: TreasurerViewProps) {
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterAudit, setFilterAudit] = useState<'all' | 'Unaudited' | 'Audited' | 'Flagged'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  // Hog IGP Chart Filter States
  const [chartYear, setChartYear] = useState<string>('all');
  const [chartProduce, setChartProduce] = useState<string>('Hog Raising');

  // Dynamic Capital Grant State from DB
  const liveCapitalGrant = typeof hogRaising?.capitalGrant === 'number'
    ? hogRaising.capitalGrant
    : (Number(hogRaising?.capitalGrant) || 0);
  const [isEditingGrant, setIsEditingGrant] = useState(false);
  const [grantInput, setGrantInput] = useState(liveCapitalGrant.toString());

  useEffect(() => {
    setGrantInput(liveCapitalGrant.toString());
  }, [liveCapitalGrant]);

  // Add Transaction Form
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [txCategory, setTxCategory] = useState('Membership Dues');
  const [txFundSource, setTxFundSource] = useState('GF-SLP (General Fund / DSWD-SLP Operational Buffer)');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txDesc, setTxDesc] = useState('');

  // Custom / Different Fund Source Option in Transaction Modal
  const [isCustomFundSource, setIsCustomFundSource] = useState(false);
  const [customFundName, setCustomFundName] = useState('');
  const [customFundCode, setCustomFundCode] = useState('');
  const [saveCustomToFunds, setSaveCustomToFunds] = useState(true);

  // Add Organization Fund Modal
  const [showAddFundModal, setShowAddFundModal] = useState(false);
  const [fundFormName, setFundFormName] = useState('');
  const [fundFormCode, setFundFormCode] = useState('');
  const [fundFormAllocated, setFundFormAllocated] = useState('');
  const [fundFormBalance, setFundFormBalance] = useState('');
  const [fundFormCustodian, setFundFormCustodian] = useState('Treasurer Gracelyn P. Asendiente');
  const [fundFormDescription, setFundFormDescription] = useState('');

  // Audit Form
  const [auditStatus, setAuditStatus] = useState<'Audited' | 'Flagged'>('Audited');
  const [auditNotes, setAuditNotes] = useState('');

  const CATEGORIES = {
    income: ['Membership Dues', 'Donation', 'Livelihood Assistance', 'Produce Sales', 'Coop Fee', 'Other Income'],
    expense: ['Seeds & Seedlings', 'Fertilizer Depot', 'Equipment Purchase', 'Equipment Maintenance', 'Meeting Snacks & Logistics', 'Honorarium', 'Other Expense']
  };

  const calculateBalances = () => {
    let income = 0;
    let expenses = 0;
    transactions.forEach(t => {
      if (t.type === 'income') income += t.amount;
      else expenses += t.amount;
    });
    return {
      total: income - expenses,
      income,
      expenses
    };
  };

  const { total: currentBalance, income: totalIncome, expenses: totalExpenses } = calculateBalances();

  // Compute available years for the Hog Raising IGP chart
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    (hogRaising?.expenses || []).forEach(e => {
      if (e.date && e.date.length >= 4) yearsSet.add(e.date.substring(0, 4));
    });
    (hogRaising?.sales || []).forEach(s => {
      if (s.date && s.date.length >= 4) yearsSet.add(s.date.substring(0, 4));
    });
    return Array.from(yearsSet).sort().reverse();
  }, [hogRaising]);

  // Compute available produces
  const availableProduces = useMemo(() => {
    return (hogRaising?.produces || ['Chairs Rental', 'Sacks Rental', 'Crop Livelihood']).filter(p => !p.toLowerCase().includes('tilapia'));
  }, [hogRaising]);

  // Aggregate monthly expenses and sales income for the Hog Raising IGP Project
  const monthlyChartData = useMemo(() => {
    if (!hogRaising) return [];

    const map: Record<string, { 
      monthKey: string; 
      monthLabel: string; 
      shortMonth: string;
      income: number; 
      expenses: number; 
      net: number; 
      hogsSold: number;
      feedExpenses: number;
      pigletExpenses: number;
      medExpenses: number;
    }> = {};

    const targetExpenses = (hogRaising.expenses || []).filter(e => {
      const matchesProduce = !chartProduce || chartProduce === 'all' || (e.produce || 'Hog Raising') === chartProduce;
      const matchesYear = chartYear === 'all' || (e.date && e.date.startsWith(chartYear));
      return matchesProduce && matchesYear;
    });

    const targetSales = (hogRaising.sales || []).filter(s => {
      const matchesProduce = !chartProduce || chartProduce === 'all' || (s.produce || 'Hog Raising') === chartProduce;
      const matchesYear = chartYear === 'all' || (s.date && s.date.startsWith(chartYear));
      return matchesProduce && matchesYear;
    });

    targetExpenses.forEach(e => {
      if (!e.date) return;
      const monthKey = e.date.substring(0, 7);
      if (!map[monthKey]) {
        const [y, m] = monthKey.split('-');
        const d = new Date(parseInt(y), parseInt(m) - 1, 1);
        const monthLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        const shortMonth = d.toLocaleString('en-US', { month: 'short' });
        map[monthKey] = {
          monthKey,
          monthLabel,
          shortMonth: `${shortMonth} '${y.slice(2)}`,
          income: 0,
          expenses: 0,
          net: 0,
          hogsSold: 0,
          feedExpenses: 0,
          pigletExpenses: 0,
          medExpenses: 0
        };
      }
      const amt = Number(e.amount) || 0;
      map[monthKey].expenses += amt;
      if (e.category === 'Feeds') map[monthKey].feedExpenses += amt;
      else if (e.category === 'Piglets') map[monthKey].pigletExpenses += amt;
      else if (e.category === 'Vitamins/Medicines') map[monthKey].medExpenses += amt;
    });

    targetSales.forEach(s => {
      if (!s.date) return;
      const monthKey = s.date.substring(0, 7);
      if (!map[monthKey]) {
        const [y, m] = monthKey.split('-');
        const d = new Date(parseInt(y), parseInt(m) - 1, 1);
        const monthLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        const shortMonth = d.toLocaleString('en-US', { month: 'short' });
        map[monthKey] = {
          monthKey,
          monthLabel,
          shortMonth: `${shortMonth} '${y.slice(2)}`,
          income: 0,
          expenses: 0,
          net: 0,
          hogsSold: 0,
          feedExpenses: 0,
          pigletExpenses: 0,
          medExpenses: 0
        };
      }
      const rev = Number(s.revenue) || 0;
      map[monthKey].income += rev;
      map[monthKey].hogsSold += Number(s.hogsCount || s.produceCount || 0);
    });

    const sortedKeys = Object.keys(map).sort();
    return sortedKeys.map(k => {
      const item = map[k];
      item.net = item.income - item.expenses;
      return item;
    });
  }, [hogRaising, chartProduce, chartYear]);

  // Overall totals for the active IGP chart selection
  const chartTotals = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalHogs = 0;
    monthlyChartData.forEach(d => {
      totalIncome += d.income;
      totalExpenses += d.expenses;
      totalHogs += d.hogsSold;
    });
    return {
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      totalHogs,
      margin: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0
    };
  }, [monthlyChartData]);

  const handleTypeChange = (type: 'income' | 'expense') => {
    setTxType(type);
    setTxCategory(CATEGORIES[type][0]);
    setIsCustomFundSource(false);
  };

  const handleAddFundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundFormName.trim()) return;

    const allocated = parseFloat(fundFormAllocated) || 0;
    const balance = fundFormBalance ? parseFloat(fundFormBalance) : allocated;
    const code = fundFormCode.trim().toUpperCase() || 
                 fundFormName.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 8);

    if (onAddFund) {
      onAddFund({
        name: fundFormName.trim(),
        code,
        allocatedAmount: allocated,
        currentBalance: balance,
        custodian: fundFormCustodian.trim() || 'Treasurer Gracelyn P. Asendiente',
        description: fundFormDescription.trim() || 'Opisyal nga pundo sa asosasyon'
      });
    }

    // Set this newly created fund as active in the transaction modal
    setTxFundSource(`${code} (${fundFormName.trim()})`);
    setIsCustomFundSource(false);

    // Reset fund form
    setFundFormName('');
    setFundFormCode('');
    setFundFormAllocated('');
    setFundFormBalance('');
    setFundFormCustodian('Treasurer Gracelyn P. Asendiente');
    setFundFormDescription('');
    setShowAddFundModal(false);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || parseFloat(txAmount) <= 0 || !txDesc.trim()) return;

    let finalFundSource = txFundSource;
    if (isCustomFundSource) {
      if (!customFundName.trim()) return;
      const codeDerived = customFundCode.trim().toUpperCase() ||
        customFundName.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 8);
      finalFundSource = `${codeDerived} (${customFundName.trim()})`;

      // If Treasurer opted to register this as an official permanent fund account
      if (saveCustomToFunds && onAddFund) {
        onAddFund({
          name: customFundName.trim(),
          code: codeDerived,
          allocatedAmount: txType === 'income' ? parseFloat(txAmount) : 0,
          currentBalance: txType === 'income' ? parseFloat(txAmount) : 0,
          custodian: 'Treasurer Gracelyn P. Asendiente',
          description: `Tinubdan sa pundo nga gi-rekord ni Treasurer alang sa ${txType === 'income' ? 'nadawat nga kita' : 'gasto'}: ${txDesc}`
        });
      }
    }

    onAddTransaction({
      type: txType,
      category: txCategory,
      amount: parseFloat(txAmount),
      date: txDate,
      description: txDesc,
      fundSource: finalFundSource,
      recordedBy: 'Treasurer (Gracelyn P Asendiente)'
    });

    setTxAmount('');
    setTxDesc('');
    setCustomFundName('');
    setCustomFundCode('');
    setIsCustomFundSource(false);
    setTxDate(new Date().toISOString().split('T')[0]);
    setShowAddModal(false);
  };

  const handleAuditClick = (txId: string, defaultStatus: 'Audited' | 'Flagged') => {
    setSelectedTxId(txId);
    setAuditStatus(defaultStatus);
    setAuditNotes('');
    setShowAuditModal(true);
  };

  const handleAuditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxId) return;
    onAuditTransaction(selectedTxId, auditStatus, auditNotes.trim() || 'No audit comments.');
    setSelectedTxId(null);
    setShowAuditModal(false);
  };

  // Filter Transactions
  const filteredTx = transactions.filter(t => {
    const matchesType = filterType === 'all' || t.type === filterType;
    const matchesAudit = filterAudit === 'all' || t.auditedStatus === filterAudit;
    return matchesType && matchesAudit;
  });

  const isAuditor = currentRole === 'Auditor';

  return (
    <div id="treasurer-view-container" className="space-y-6">
      {/* FINANCIAL OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total General Funds */}
        <div className="bg-[#F7F4EF] border border-[#D5CFC1] p-5 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold text-[#4A5F57] uppercase tracking-wider">Association General Fund</span>
            <Coins className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-[#1B4332] font-mono">
            PHP {currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[10px] text-emerald-700 mt-1 flex items-center gap-1 font-medium">
            <span>● Account active</span>
            <span className="text-[#4A5F57] font-normal">| Barangay Alegria, Tuburan</span>
          </p>
        </div>

        {/* Total Income */}
        <div className="bg-[#F7F4EF] border border-[#D5CFC1] p-5 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold text-[#4A5F57] uppercase tracking-wider">Total Income</span>
            <div className="bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/10">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-700 font-mono">
            + PHP {totalIncome.toLocaleString('en-US')}
          </div>
          <p className="text-[10px] text-[#4A5F57] mt-2">Dues, donations, sales & livelihood capital</p>
        </div>

        {/* Total Expenses */}
        <div className="bg-[#F7F4EF] border border-[#D5CFC1] p-5 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold text-[#4A5F57] uppercase tracking-wider">Total Expenditures</span>
            <div className="bg-rose-500/10 p-1.5 rounded-lg border border-rose-500/10">
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
            </div>
          </div>
          <div className="text-xl font-bold text-rose-600 font-mono">
            - PHP {totalExpenses.toLocaleString('en-US')}
          </div>
          <p className="text-[10px] text-[#4A5F57] mt-2">Equipment, snacks, maintenance & seeds</p>
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
            <p className="text-xs text-[#4A5F57] mt-0.5">
              Live organizational treasury allocations & capital accounts recorded in PostgreSQL Cloud Database
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(currentRole === 'Treasurer' || currentRole === 'Auditor') && (
              <button
                type="button"
                onClick={() => setShowAddFundModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pagdugang og Pundo (Add Fund Source)</span>
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
            <p className="text-sm font-bold text-[#1B4332]">Walay Narehistro nga Tinubdan sa Pundo (No Fund Accounts Registered)</p>
            <p className="text-xs text-[#4A5F57] max-w-md mx-auto">
              Mahimong magdugang og bag-ong tinubdan sa pundo (pananglitan: DSWD-SLP, DA Assistance, LGU Aid, o Member Capital Build-Up) aron masubay ang matag pundo sa asosasyon.
            </p>
            <button
              type="button"
              onClick={() => setShowAddFundModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Pagdugang og Tinubdan sa Pundo (Add First Fund Source)</span>
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
                    <p className="text-xs text-[#4A5F57] mt-1">{fund.description}</p>
                  </div>
                  {onDeleteFund && (currentRole === 'Treasurer' || currentRole === 'Auditor') && (
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
                    <span className="font-mono font-bold text-[#1B4332]">PHP {fund.allocatedAmount.toLocaleString('en-US')}</span>
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

      {/* HOG RAISING IGP MONTHLY EXPENSES VS. INCOME RECHARTS BAR CHART */}
      <div className="bg-slate-800 border border-slate-700/70 p-5 sm:p-6 rounded-2xl space-y-5 shadow-lg relative">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-700/70">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <Briefcase className="w-5 h-5 text-emerald-400" />              </div>
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <span>Association IGP & Rentals - Monthly Expenses vs. Income Trends</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Interactive Recharts
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Visualizing monthly feeds, stock purchases, veterinary care vs. mature hog sales revenue
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Filters */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {availableProduces.length > 1 && (
              <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-700/60 text-xs">
                <span className="text-slate-400 font-semibold text-[11px]">Project:</span>
                <select
                  value={chartProduce}
                  onChange={(e) => setChartProduce(e.target.value)}
                  className="bg-transparent text-emerald-300 font-bold focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-slate-800 text-white">All IGP Projects</option>
                  {availableProduces.map(p => (
                    <option key={p} value={p} className="bg-slate-800 text-white">{p}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-700/60 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-semibold text-[11px]">Cycle Year:</span>
              <select
                value={chartYear}
                onChange={(e) => setChartYear(e.target.value)}
                className="bg-transparent text-emerald-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-800 text-white">All Years</option>
                {availableYears.map(y => (
                  <option key={y} value={y} className="bg-slate-800 text-white">{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* SUMMARY KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900/80 border border-slate-700/60 p-3.5 rounded-xl">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total IGP Sales</span>
            <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
              PHP {chartTotals.totalIncome.toLocaleString('en-US')}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {chartTotals.totalHogs} mature hogs sold
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-700/60 p-3.5 rounded-xl">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total IGP Expenses</span>
            <div className="text-lg font-black text-rose-400 font-mono mt-0.5">
              PHP {chartTotals.totalExpenses.toLocaleString('en-US')}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Feeds, piglets & veterinary
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-700/60 p-3.5 rounded-xl">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Net IGP Cash Flow</span>
            <div className={`text-lg font-black font-mono mt-0.5 ${chartTotals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {chartTotals.net >= 0 ? '+' : ''}PHP {chartTotals.net.toLocaleString('en-US')}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {chartTotals.margin > 0 ? `${chartTotals.margin.toFixed(1)}% profit margin` : 'Ongoing rearing cycle'}
            </span>
          </div>

          <div className="bg-slate-900/80 border border-slate-700/60 p-3.5 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Capital Allocation</span>
              {onUpdateCapitalGrant && (currentRole === 'Treasurer' || currentRole === 'Auditor') && !isEditingGrant && (
                <button
                  type="button"
                  onClick={() => setIsEditingGrant(true)}
                  className="text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-800/60 px-2 py-0.5 rounded transition cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>

            {isEditingGrant ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = parseFloat(grantInput);
                  if (!isNaN(val) && val >= 0) {
                    onUpdateCapitalGrant?.(val);
                    setIsEditingGrant(false);
                  }
                }}
                className="mt-1.5 space-y-1.5"
              >
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">₱</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={grantInput}
                    onChange={(e) => setGrantInput(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/70 rounded-lg pl-6 pr-2 py-1 text-sm font-mono text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                <div className="flex gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingGrant(false);
                      setGrantInput(liveCapitalGrant.toString());
                    }}
                    className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-0.5 text-[10px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded cursor-pointer font-black"
                  >
                    Save DB
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="text-lg font-black text-amber-400 font-mono mt-0.5">
                  PHP {liveCapitalGrant.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-emerald-400 mt-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>DOLE & DA Seed Capital</span>
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Live DB</span>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RECHARTS BAR CHART CANVAS */}
        {monthlyChartData.length > 0 ? (
          <div className="space-y-4">
            <div className="h-[300px] w-full bg-slate-900/50 p-2 sm:p-4 rounded-xl border border-slate-700/50">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyChartData}
                  margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.6} />
                  <XAxis 
                    dataKey="shortMonth" 
                    stroke="#94a3b8" 
                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                    tickLine={{ stroke: '#475569' }}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickLine={{ stroke: '#475569' }}
                    tickFormatter={(val) => `₱${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 border border-slate-700 p-3.5 rounded-xl shadow-2xl text-xs space-y-2.5 min-w-[210px]">
                            <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5">
                              <span className="font-bold text-white text-sm">{data.monthLabel}</span>
                              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                {chartProduce === 'all' ? 'All IGP' : chartProduce}
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center gap-4">
                                <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                                  Sales (Income):
                                </span>
                                <span className="font-mono font-bold text-emerald-300">
                                  PHP {Number(data.income).toLocaleString('en-US')}
                                </span>
                              </div>

                              <div className="flex justify-between items-center gap-4">
                                <span className="text-rose-400 flex items-center gap-1.5 font-medium">
                                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                                  Total Expenses:
                                </span>
                                <span className="font-mono font-bold text-rose-300">
                                  PHP {Number(data.expenses).toLocaleString('en-US')}
                                </span>
                              </div>

                              {data.feedExpenses > 0 && (
                                <div className="pl-4 text-[11px] text-slate-400 flex justify-between">
                                  <span>• Feeds:</span>
                                  <span className="font-mono">PHP {data.feedExpenses.toLocaleString('en-US')}</span>
                                </div>
                              )}
                              {data.pigletExpenses > 0 && (
                                <div className="pl-4 text-[11px] text-slate-400 flex justify-between">
                                  <span>• Piglets / Stock:</span>
                                  <span className="font-mono">PHP {data.pigletExpenses.toLocaleString('en-US')}</span>
                                </div>
                              )}
                              {data.medExpenses > 0 && (
                                <div className="pl-4 text-[11px] text-slate-400 flex justify-between">
                                  <span>• Vitamins / Meds:</span>
                                  <span className="font-mono">PHP {data.medExpenses.toLocaleString('en-US')}</span>
                                </div>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-800 flex justify-between items-center gap-4">
                              <span className="text-slate-300 font-semibold">Net Cash Flow:</span>
                              <span className={`font-mono font-bold ${data.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
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
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
                    formatter={(value) => <span className="text-slate-300 font-medium text-xs mr-3">{value}</span>}
                  />
                  <Bar 
                    dataKey="income" 
                    name="Hog Sales (Income)" 
                    fill="#10B981" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={42} 
                  />
                  <Bar 
                    dataKey="expenses" 
                    name="IGP Expenses (Feeds & Stock)" 
                    fill="#F43F5E" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={42} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* MONTHLY SUMMARY CHIPS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-1">
              {monthlyChartData.map((m) => (
                <div key={m.monthKey} className="bg-slate-900/60 border border-slate-700/60 p-2.5 rounded-xl space-y-1 text-xs">
                  <span className="font-bold text-slate-300 block">{m.shortMonth}</span>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-emerald-400 font-mono">+{m.income >= 1000 ? `${(m.income/1000).toFixed(0)}k` : m.income}</span>
                    <span className="text-rose-400 font-mono">-{m.expenses >= 1000 ? `${(m.expenses/1000).toFixed(0)}k` : m.expenses}</span>
                  </div>
                  <div className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-center ${
                    m.net >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {m.net >= 0 ? '+' : ''}₱{Math.abs(m.net).toLocaleString('en-US')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-700/60 p-8 rounded-xl text-center space-y-2">
            <BarChart3 className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm font-bold text-slate-300">Walay natala nga transaksyon sa napili nga tuig o proyekto.</p>
            <p className="text-xs text-slate-500">I-adjust ang filters o mag-log og bag-ong expenses/sales sa Hog Raising tab.</p>
          </div>
        )}
      </div>

      {/* OFFICER SUMMARY DESCRIPTION AND TOOLS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 p-4 rounded-2xl border border-slate-700/65">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-emerald-400" />
            <span>{isAuditor ? 'Auditor Financial Oversight' : 'Treasurer Financial Ledger'}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAuditor 
              ? 'Verify association transaction records and highlight any financial discrepancies.' 
              : 'Record all incoming payments, member dues, and association expenses.'}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {onOpenReportModal && (
            <button
              id="treasurer-report-btn"
              type="button"
              onClick={onOpenReportModal}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-850 text-emerald-400 border border-emerald-500/30 rounded-xl shadow-sm transition-all w-full md:w-auto cursor-pointer"
            >
              <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{isAuditor ? 'Export Auditor Report' : 'Export Financial Report'}</span>
            </button>
          )}

          {!isAuditor ? (
            <button
              id="record-tx-btn"
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all w-full md:w-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Log Transaction</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-2 rounded-xl border border-slate-700/60 text-xs text-emerald-400 font-semibold w-full md:w-auto justify-center">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Auditor Active Security Mode</span>
            </div>
          )}
        </div>
      </div>

      {/* FILTER & LEDGER LIST */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-750">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expenses Only</option>
            </select>

            <select
              value={filterAudit}
              onChange={(e) => setFilterAudit(e.target.value as any)}
              className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
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
            filteredTx.map((tx) => (
              <div 
                key={tx.id} 
                className={`bg-slate-800 border rounded-2xl p-4.5 transition-all shadow-sm flex flex-col md:flex-row justify-between gap-4 ${
                  tx.auditedStatus === 'Flagged' 
                    ? 'border-red-500/30 bg-gradient-to-r from-slate-800 to-red-950/10' 
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
                    <p className="text-[10px] text-slate-500 mt-1">Logged by: {tx.recordedBy}</p>

                    {/* Audit Details Sub-Block */}
                    {tx.auditedStatus !== 'Unaudited' && (
                      <div className={`mt-3 p-2.5 rounded-xl text-xs border ${
                        tx.auditedStatus === 'Flagged'
                          ? 'bg-red-500/5 border-red-500/20 text-red-300'
                          : 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300'
                      }`}>
                        <div className="flex items-center gap-1.5 font-bold mb-0.5">
                          {tx.auditedStatus === 'Flagged' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          <span>
                            {tx.auditedStatus === 'Flagged' ? 'Audit Note / Flagged' : 'Audited and Approved'}
                          </span>
                        </div>
                        <p className="leading-relaxed text-slate-300 italic">"{tx.auditNotes}"</p>
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

                  {/* Audit Actions (Visible to Auditor) */}
                  {isAuditor ? (
                    tx.auditedStatus === 'Unaudited' ? (
                      <div className="flex gap-2">
                        <button
                          id={`flag-btn-${tx.id}`}
                          onClick={() => handleAuditClick(tx.id, 'Flagged')}
                          className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-950/30 hover:bg-red-900/30 border border-red-500/20 px-2.5 py-1 rounded-lg transition-all"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>Flag</span>
                        </button>
                        <button
                          id={`verify-btn-${tx.id}`}
                          onClick={() => handleAuditClick(tx.id, 'Audited')}
                          className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/30 hover:bg-emerald-900/30 border border-emerald-500/20 px-2.5 py-1 rounded-lg transition-all"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>Approve</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        id={`re-audit-${tx.id}`}
                        onClick={() => handleAuditClick(tx.id, tx.auditedStatus === 'Audited' ? 'Audited' : 'Flagged')}
                        className="text-[10px] text-slate-500 hover:text-slate-300 underline font-medium transition-colors"
                      >
                        Re-evaluate Audit
                      </button>
                    )
                  ) : (
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
                    {onDeleteTransaction && (
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
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-8 text-center text-slate-500">
              No transactions match selected filter.
            </div>
          )}
        </div>
      </div>

      {/* TREASURER ADD TRANSACTION MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className={`px-5 py-4 border-b flex justify-between items-center ${
              txType === 'income' 
                ? 'bg-gradient-to-r from-emerald-950/70 to-slate-900 border-emerald-500/30' 
                : 'bg-gradient-to-r from-rose-950/70 to-slate-900 border-rose-500/30'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl border ${
                  txType === 'income' 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                  {txType === 'income' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {txType === 'income' 
                      ? 'I-rekord ang Kita / Record Income (Deposit Inflow)' 
                      : 'I-rekord ang Gasto / Record Expenditure (Outflow)'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {txType === 'income'
                      ? 'Pagsulod sa pundo — pilia kon diin ibutang o ideposito ang nadawat nga kita'
                      : 'Paggawas sa pundo — pilia kon diin kuhaon ang gahin alang sa maong gasto'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setIsCustomFundSource(false);
                }}
                className="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5 flex items-center justify-between">
                  <span>Ledger Flow / Direksyon sa Kwarta</span>
                  <span className={`text-[10px] font-bold ${txType === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {txType === 'income' ? '● MISULOD (INFLOW / DEPOSIT)' : '● MIGAWAZ (OUTFLOW / DISBURSEMENT)'}
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
                    <span>Income (Kita / Pagsulod)</span>
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
                    <span>Expenditure (Gasto / Paggawas)</span>
                  </button>
                </div>
              </div>

              {/* Amount and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    {txType === 'income' ? 'Kantidad nga Misulod / Amount (PHP)' : 'Kantidad nga Gigasto / Amount (PHP)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-slate-400 font-mono text-sm">₱</span>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      placeholder={txType === 'income' ? 'e.g. 1500' : 'e.g. 750'}
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      className="w-full pl-8 pr-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    {txType === 'income' ? 'Adlaw nga Nadawat / Date Received' : 'Adlaw sa Gasto / Date Paid'}
                  </label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  {txType === 'income' ? 'Klase sa Kita / Income Category' : 'Klase sa Gasto / Expense Category'}
                </label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                >
                  {CATEGORIES[txType].map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Fund Account Selection (Deposit Destination for Income, Budget Source for Expense) */}
              <div className="space-y-1.5 bg-slate-900/60 p-3.5 rounded-xl border border-slate-750">
                <label className="block text-xs font-bold text-slate-300 uppercase flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Wallet className={`w-3.5 h-3.5 ${txType === 'income' ? 'text-emerald-400' : 'text-rose-400'}`} />
                    <span className={txType === 'income' ? 'text-emerald-300' : 'text-rose-300'}>
                      {txType === 'income' 
                        ? 'Diin Ibutang / Ideosito ang Kita (Deposit Destination)' 
                        : 'Diin Kuhaon ang Pundo / Budget Source (Source to Debit)'}
                    </span>
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    txType === 'income' 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                    {txType === 'income' ? 'Deposit Destination' : 'Source Account'}
                  </span>
                </label>
                <p className="text-[11px] text-slate-400">
                  {txType === 'income'
                    ? 'Pilia kon asa nga pundo o bank account ibutang kining maong kita (where the income will be put / deposited).'
                    : 'Pilia kon asa nga pundo o gahin kuhaon kining maong gasto alang sa audit traceability (where the budget will be taken from).'}
                </p>

                <div className="flex gap-2 pt-1">
                  <select
                    value={isCustomFundSource ? '__custom__' : txFundSource}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomFundSource(true);
                      } else {
                        setIsCustomFundSource(false);
                        setTxFundSource(e.target.value);
                      }
                    }}
                    className="flex-1 px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  >
                    {/* Registered Dynamic Funds */}
                    {funds.length > 0 && (
                      <optgroup label={txType === 'income' ? 'Narehistro nga mga Pundo (Deposit Destination)' : 'Narehistro nga mga Pundo (Budget Source)'}>
                        {funds.map(f => (
                          <option key={f.id} value={`${f.code} (${f.name})`}>
                            {txType === 'income' ? 'Ideosito sa: ' : 'Kuhaon sa: '} {f.code} - {f.name} (Bal: ₱{f.currentBalance.toLocaleString()})
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {/* Standard Statutory & Partner Accounts */}
                    <optgroup label="Standard Co-op & Partner Allocations">
                      <option value="GF-SLP (General Fund / DSWD-SLP Operational Buffer)">
                        {txType === 'income' ? 'Ideosito sa: ' : 'Kuhaon sa: '} GF-SLP (General Fund / DSWD-SLP Operational Buffer)
                      </option>
                      <option value="DOLE Integrated Livelihood Program (DILP) Capital Allocation">
                        {txType === 'income' ? 'Ideosito sa: ' : 'Kuhaon sa: '} DOLE Integrated Livelihood Program (DILP) Capital Allocation
                      </option>
                      <option value="CBU (Member Capital Build-Up & Equity Fund)">
                        {txType === 'income' ? 'Ideosito sa: ' : 'Kuhaon sa: '} CBU (Member Capital Build-Up & Equity Fund)
                      </option>
                      <option value="FCCT-SAVINGS (FCCT Cooperative Bank Deposit)">
                        {txType === 'income' ? 'Ideosito sa: ' : 'Kuhaon sa: '} FCCT-SAVINGS (FCCT Cooperative Bank Deposit)
                      </option>
                      <option value="ATI-TRG (ATI Training & Capacity Building Fund)">
                        {txType === 'income' ? 'Ideosito sa: ' : 'Kuhaon sa: '} ATI-TRG (ATI Training & Capacity Building Fund)
                      </option>
                      <option value="DISP-5% (Dispersal & Livestock Insurance Risk Pool)">
                        {txType === 'income' ? 'Ideosito sa: ' : 'Kuhaon sa: '} DISP-5% (Dispersal & Livestock Insurance Risk Pool)
                      </option>
                      <option value="LGU Tuburan Agriculture Assistance Fund">
                        {txType === 'income' ? 'Ideosito sa: ' : 'Kuhaon sa: '} LGU Tuburan Agriculture Assistance Fund
                      </option>
                    </optgroup>

                    <optgroup label="Lahi nga Tinubdan / Different Source">
                      <option value="__custom__">
                        {txType === 'income' 
                          ? '+ Magdugang og Lahi nga Pundo nga Sudlan (Specify Different Target Fund)...' 
                          : '+ Magdugang og Lahi nga Tinubdan sa Pundo (Specify Different Source)...'}
                      </option>
                    </optgroup>
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowAddFundModal(true)}
                    title="Rehistro og bag-ong permanenteng pundo sa asosasyon"
                    className="px-3 py-2 bg-slate-750 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-slate-650 flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Bag-ong Pundo</span>
                  </button>
                </div>

                {/* Inline Different Fund Source Input */}
                {isCustomFundSource && (
                  <div className="mt-2.5 p-3.5 bg-slate-950/90 rounded-xl border border-emerald-500/40 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                      <span>
                        {txType === 'income' ? 'Lahi nga Pundo nga Sudlan sa Kita' : 'Lahi nga Tinubdan sa Pundo'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomFundSource(false);
                          setTxFundSource(funds[0] ? `${funds[0].code} (${funds[0].name})` : 'GF-SLP (General Fund / DSWD-SLP Operational Buffer)');
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                      >
                        Balik sa lista
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                          Pangalan sa Pundo / Fund Name <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required={isCustomFundSource}
                          placeholder={txType === 'income' ? 'e.g. DA Rice Assistance Fund, Barangay Subsidy' : 'e.g. Special Project Grant, Private Donation'}
                          value={customFundName}
                          onChange={(e) => setCustomFundName(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                          Code / Tag (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. DA-RICE"
                          value={customFundCode}
                          onChange={(e) => setCustomFundCode(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveCustomToFunds}
                          onChange={(e) => setSaveCustomToFunds(e.target.checked)}
                          className="rounded border-slate-600 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-[11px]">
                          I-rehistro usab kini sa Opisyal nga Database sa Pundo sa Asosasyon (Save to permanent fund accounts)
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  {txType === 'income' 
                    ? 'Official Receipt / Collection Note (Resibo ug Deskripsyon sa Kita)' 
                    : 'Voucher / Expense Receipt Note (Resibo ug Deskripsyon sa Gasto)'}
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder={
                    txType === 'income'
                      ? 'OR # ug detalye kon kinsa ang nagbayad o diin gikan ang kita (e.g. OR #1042 - bayad sa membership dues ni Maria)...'
                      : 'Disbursement voucher # ug detalye sa gipalit o binayran (e.g. DV #089 - gipalit nga abono ug bitamina sa baboy)...'
                  }
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setIsCustomFundSource(false);
                  }}
                  className="flex-1 py-2.5 text-sm font-semibold bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  Kanselahon (Cancel)
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === 'income' 
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40' 
                      : 'bg-rose-700 hover:bg-rose-650 shadow-rose-950/40'
                  }`}
                >
                  {txType === 'income' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>
                    {txType === 'income' ? 'I-rekord ang Kita (Deposit Income)' : 'I-rekord ang Gasto (Disburse Expense)'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ORGANIZATION FUND MODAL */}
      {showAddFundModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Pagdugang og Tinubdan sa Pundo (Add Fund Source)</h3>
                  <p className="text-xs text-slate-400">Rehistro sa bag-ong pundo o kapital nga account sa asosasyon</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAddFundModal(false)}
                className="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddFundSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Pangalan sa Pundo / Fund Account Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DA Corn Banner Assistance Grant, LGU Seedling Subsidy, Special Relief Fund"
                  value={fundFormName}
                  onChange={(e) => setFundFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Fund Code / Tag (e.g. DA-CORN)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DA-CORN, LGU-AGRI"
                    value={fundFormCode}
                    onChange={(e) => setFundFormCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white uppercase font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Custodian / Gikasilogan
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
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Allocated Capital (PHP)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 25000"
                    value={fundFormAllocated}
                    onChange={(e) => {
                      setFundFormAllocated(e.target.value);
                      if (!fundFormBalance) {
                        setFundFormBalance(e.target.value);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Current Live Balance (PHP)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Defaults to allocated capital"
                    value={fundFormBalance}
                    onChange={(e) => setFundFormBalance(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Deskripsyon / Katuyoan sa Pundo (Description & Purpose)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Gahin gikan sa ahensya alang sa palit og abono, binhi, o pasilidad sa mga mag-uuma..."
                  value={fundFormDescription}
                  onChange={(e) => setFundFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddFundModal(false)}
                  className="flex-1 py-2.5 text-sm font-semibold bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  Kanselahon (Cancel)
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>I-rehistro ang Pundo (Save Fund)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDITOR REVIEW MODAL */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-base">Conduct Financial Audit</h3>
              <button 
                onClick={() => { setSelectedTxId(null); setShowAuditModal(false); }}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAuditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Audit Verdict</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-xl border border-slate-750">
                  <button
                    type="button"
                    onClick={() => setAuditStatus('Audited')}
                    className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
                      auditStatus === 'Audited' 
                        ? 'bg-emerald-600 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Verify & Approve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditStatus('Flagged')}
                    className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
                      auditStatus === 'Flagged' 
                        ? 'bg-rose-700 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Flag / Action Req.</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Audit Explanatory Comments</label>
                <textarea
                  rows={4}
                  required
                  placeholder={
                    auditStatus === 'Audited'
                      ? 'e.g. Matched receipts and verified correct with cash-on-hand.'
                      : 'e.g. Missing receipt or mismatch in totals. Please provide proof of payment.'
                  }
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setSelectedTxId(null); setShowAuditModal(false); }}
                  className="flex-1 py-2.5 text-sm font-semibold bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all"
                >
                  Submit Audit Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
