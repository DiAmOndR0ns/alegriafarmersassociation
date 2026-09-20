import React, { useState, useEffect } from 'react';
import { 
  HogRaisingState, IgpExpense, IgpSale, IgpChoreLog, IgpGroup, Member, User, Meeting 
} from '../types';
import { 
  Briefcase, Boxes, Package, Plus, ArrowUpRight, ArrowDownRight, Calendar, Users,   Activity, Trash2, Printer, CheckCircle, Info, DollarSign, 
  Tag, ShieldCheck, Heart, Sparkles, Filter, FileText, Check, Award, Calculator
} from 'lucide-react';
import AttendanceDividendCalculatorModal from './AttendanceDividendCalculatorModal';

interface HogRaisingIgpTrackerProps {
  state: HogRaisingState;
  members: Member[];
  meetings?: Meeting[];
  onAddExpense: (expense: Omit<IgpExpense, 'id' | 'recordedBy'>) => void;
  onAddSale: (sale: Omit<IgpSale, 'id' | 'recordedBy'>) => void;
  onAddChoreLog: (chore: Omit<IgpChoreLog, 'id'>) => void;
  onUpdateCapitalGrant?: (amount: number) => void;
  onAddProduce?: (produce: string) => void;
  isTreasurerOrOfficer: boolean;
  currentUser: User;
  isOfficerMode?: boolean; // Toggles styling to match Officer's dark slate or Member's warm green
  closedYears?: number[];
  onCloseDecemberBook?: (year: number) => void;
}

export default function HogRaisingIgpTracker({
  state,
  members,
  meetings = [],
  onAddExpense,
  onAddSale,
  onAddChoreLog,
  onUpdateCapitalGrant,
  onAddProduce,
  isTreasurerOrOfficer,
  currentUser,
  isOfficerMode = false,
  closedYears = state.closedYears || [2025],
  onCloseDecemberBook
}: HogRaisingIgpTrackerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'chores' | 'dividends' | 'ledger' | 'reports'>('overview');
  const [showDividendCalcModal, setShowDividendCalcModal] = useState(false);
  
  // Dynamic produces - strictly remove any Tilapia and ensure Chairs & Sacks Rentals are available
  const rawProduces = state.produces || ['Hog Raising', 'Chairs Rental (Abang sa Lingkoranan)', 'Sacks Rental (Abang sa Sako)', 'Poultry Raising'];
  const filteredProduces = Array.from(new Set(rawProduces.filter(p => p !== 'Tilapia Breeding' && !p.toLowerCase().includes('tilapia'))));
  if (!filteredProduces.includes('Chairs Rental (Abang sa Lingkoranan)')) {
    filteredProduces.push('Chairs Rental (Abang sa Lingkoranan)');
  }
  if (!filteredProduces.includes('Sacks Rental (Abang sa Sako)')) {
    filteredProduces.push('Sacks Rental (Abang sa Sako)');
  }
  const produces = filteredProduces;
  const [selectedProduce, setSelectedProduce] = useState<string>(produces[0] || 'Hog Raising');
  const [newProduceName, setNewProduceName] = useState('');
  const [showAddProduceModal, setShowAddProduceModal] = useState(false);

  const getProduceLocalName = (produce: string) => {
    if (produce === 'Hog Raising') return 'Baboyan';
    if (produce === 'Poultry Raising') return 'Manokan';
    if (produce.includes('Chairs') || produce.includes('Lingkoranan')) return 'Abang sa Lingkoranan';
    if (produce.includes('Sacks') || produce.includes('Sako')) return 'Abang sa Sako';
    return produce;
  };

  const selectedProduceLocalName = getProduceLocalName(selectedProduce);
  const getProduceProjectName = (produce: string) => {
    if (produce.includes('Rental')) return `${produce} (Open for All)`;
    return `${produce} Project IGP`;
  };

  // Filter lists by selected produce
  const filteredExpenses = state.expenses.filter(e => (e.produce || 'Hog Raising') === selectedProduce);
  const filteredSales = state.sales.filter(s => (s.produce || 'Hog Raising') === selectedProduce);
  const filteredChoreLogs = state.choreLogs.filter(c => (c.produce || 'Hog Raising') === selectedProduce);

  // Ledger Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);

  // New Chore Log Form
  const [choreBatchName, setChoreBatchName] = useState(state.groups[0]?.name || 'Batch 1 (Lunes)');
  const [choreCheckedBy, setChoreCheckedBy] = useState(currentUser.name || '');
  const [choreChoreActivities, setChoreChoreActivities] = useState<string[]>([]);
  const [choreNotes, setChoreNotes] = useState('');

  // New Expense Form
  const [expCategory, setExpCategory] = useState<string>('Feeds');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseDateError, setExpenseDateError] = useState('');

  // New Sale Form
  const [saleHogsCount, setSaleHogsCount] = useState('');
  const [saleRevenue, setSaleRevenue] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleNotes, setSaleNotes] = useState('');
  const [saleDateError, setSaleDateError] = useState('');

  // Reports State
  const [reportYear, setReportYear] = useState<number>(2026);

  // Helper to change dates with validation against closed years
  const handleExpenseDateChange = (val: string) => {
    setExpDate(val);
    const yr = parseInt(val.substring(0, 4));
    if (closedYears.includes(yr)) {
      setExpenseDateError(`Sirado ang Libro: Ang financial book sa ${yr} gisirado na niadtong Disyembre.`);
    } else {
      setExpenseDateError('');
    }
  };

  const handleSaleDateChange = (val: string) => {
    setSaleDate(val);
    const yr = parseInt(val.substring(0, 4));
    if (closedYears.includes(yr)) {
      setSaleDateError(`Sirado ang Libro: Ang financial book sa ${yr} gisirado na niadtong Disyembre.`);
    } else {
      setSaleDateError('');
    }
  };

  // Quarterly proceeds calculation helper
  const getQuarterlyReportData = (year: number) => {
    const quarters = [
      { name: 'Q1', label: 'Unang Kwarter (Jan - Mar)', labelEng: 'First Quarter', months: ['01', '02', '03'], expenses: 0, sales: 0, hogsSold: 0 },
      { name: 'Q2', label: 'Ikaduhang Kwarter (Apr - Jun)', labelEng: 'Second Quarter', months: ['04', '05', '06'], expenses: 0, sales: 0, hogsSold: 0 },
      { name: 'Q3', label: 'Ikatulong Kwarter (Jul - Sep)', labelEng: 'Third Quarter', months: ['07', '08', '09'], expenses: 0, sales: 0, hogsSold: 0 },
      { name: 'Q4', label: 'Ika-upat nga Kwarter (Oct - Dec)', labelEng: 'Fourth Quarter', months: ['10', '11', '12'], expenses: 0, sales: 0, hogsSold: 0 }
    ];

    filteredExpenses.forEach(e => {
      const eYear = parseInt(e.date.substring(0, 4));
      if (eYear === year) {
        const month = e.date.substring(5, 7);
        const q = quarters.find(q => q.months.includes(month));
        if (q) q.expenses += e.amount;
      }
    });

    filteredSales.forEach(s => {
      const sYear = parseInt(s.date.substring(0, 4));
      if (sYear === year) {
        const month = s.date.substring(5, 7);
        const q = quarters.find(q => q.months.includes(month));
        if (q) {
          q.sales += s.revenue;
          q.hogsSold += s.produceCount || s.hogsCount;
        }
      }
    });

    return quarters;
  };

  const currentYearQuarters = getQuarterlyReportData(reportYear);
  const annualTotalSales = currentYearQuarters.reduce((sum, q) => sum + q.sales, 0);
  const annualTotalExpenses = currentYearQuarters.reduce((sum, q) => sum + q.expenses, 0);
  const annualTotalNet = annualTotalSales - annualTotalExpenses;
  const annualHogsSold = currentYearQuarters.reduce((sum, q) => sum + q.hogsSold, 0);

  const isSelectedYearClosed = closedYears.includes(reportYear);

  // Printable Quarterly Report for Hog Raising
  const handlePrintQuarterlyReport = (year: number) => {
    const quartersData = getQuarterlyReportData(year);
    const yrTotalSales = quartersData.reduce((sum, q) => sum + q.sales, 0);
    const yrTotalExpenses = quartersData.reduce((sum, q) => sum + q.expenses, 0);
    const yrTotalNet = yrTotalSales - yrTotalExpenses;
    const yrHogsSold = quartersData.reduce((sum, q) => sum + q.hogsSold, 0);
    const isClosed = closedYears.includes(year);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>AFA - Hog Raising IGP Quarterly Report ${year}</title>
          <style>
            body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #2d3748; line-height: 1.5; }
            .header { text-align: center; border-bottom: 3px double #1b4332; padding-bottom: 20px; margin-bottom: 30px; }
            .header h2 { margin: 0; color: #1b4332; font-size: 20px; text-transform: uppercase; }
            .header p { margin: 5px 0 0; font-size: 12px; color: #555; }
            .title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 30px; text-decoration: underline; color: #1b4332; }
            .status-badge { text-align: center; margin-bottom: 20px; }
            .status-badge span { background-color: ${isClosed ? '#fed7d7' : '#c6f6d5'}; color: ${isClosed ? '#9b2c2c' : '#22543d'}; font-weight: bold; padding: 6px 12px; border-radius: 9999px; font-size: 12px; text-transform: uppercase; border: 1px solid ${isClosed ? '#f5c6cb' : '#c3e6cb'}; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 35px; font-size: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
            th { background-color: #f7fafc; color: #1b4332; font-weight: bold; }
            .text-right { text-align: right; }
            .font-mono { font-family: monospace; }
            .total-row { font-weight: bold; background-color: #edf2f7; }
            .footer { margin-top: 50px; font-size: 11px; text-align: center; color: #718096; }
            .signature-grid { display: grid; grid-template-cols: repeat(3, 1fr); gap: 30px; margin-top: 60px; text-align: center; }
            .signature-line { border-top: 1px solid #aaa; margin-top: 40px; padding-top: 5px; font-size: 11px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Alegria Farmers Association (AFA)</h2>
            <p>Tuburan, Cebu Province, Philippines • SEC Reg. No. CN2021-0812</p>
            <p><strong>INCOME GENERATING PROJECT (IGP) - HOG RAISING PORTAL</strong></p>
          </div>

          <div class="title">OFFICIAL QUARTERLY PROCEEDS & EXPENDITURES REPORT - YEAR ${year}</div>

          <div class="status-badge">
            <span>{isClosed ? 'December Financial Books: CLOSED & CERTIFIED' : 'December Financial Books: OPEN & ACTIVE'}</span>
          </div>

          <div style="background: #e6f4ea; border: 1px solid #a3cfbb; padding: 10px 14px; border-radius: 6px; margin-bottom: 20px; font-size: 11px; color: #0f5132;">
            <strong>BUDGET & CAPITAL SOURCE (WHERE BUDGET WAS TAKEN FROM):</strong> Funded under the <strong>DOLE Integrated Livelihood Program (DILP) Capital Allocation (₱${(typeof state.capitalGrant === 'number' ? state.capitalGrant : (Number(state.capitalGrant) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })})</strong> & Municipal Agriculture Assistance. All operating expenditures (feeds, piglets, vaccines) are disbursed directly from this approved livelihood allocation.
          </div>

          <p style="font-size: 12px; margin-bottom: 20px;">
            This document represents the quarterly summary of proceeds (sales/revenues), operational expenditures, net interest profit, and total livestock counts for the Hog Raising Income Generating Project for the calendar year of <strong>${year}</strong>.
          </p>

          <table>
            <thead>
              <tr>
                <th>Quarter Period (Panahon)</th>
                <th class="text-right">Gross Proceeds (Halin PHP)</th>
                <th class="text-right">Total Expenses (Gasto PHP)</th>
                <th class="text-right">Net Profit / Interest (Tubo PHP)</th>
                <th class="text-right">Mature Hogs Sold</th>
              </tr>
            </thead>
            <tbody>
              ${quartersData.map(q => `
                <tr>
                  <td><strong>${q.name}</strong> - ${q.labelEng} (${q.label})</td>
                  <td class="text-right font-mono">PHP ${q.sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td class="text-right font-mono">PHP ${q.expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td class="text-right font-mono" style="color: ${q.sales - q.expenses >= 0 ? 'green' : 'red'}; font-weight: bold;">
                    PHP ${(q.sales - q.expenses).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td class="text-right font-mono font-bold">${q.hogsSold} baboy</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td>ANNUAL TOTAL (TIBUOK TUIG)</td>
                <td class="text-right font-mono">PHP ${yrTotalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="text-right font-mono">PHP ${yrTotalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="text-right font-mono" style="color: ${yrTotalNet >= 0 ? 'green' : 'red'}">
                  PHP ${yrTotalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td class="text-right font-mono">${yrHogsSold} baboy</td>
              </tr>
            </tbody>
          </table>

          <div class="signature-grid">
            <div>
              <div class="signature-line">RODOLFO CLIMACO<br/><span style="font-size:9px; font-weight:normal;">Treasurer, AFA</span></div>
            </div>
            <div>
              <div class="signature-line">GERVACIO CABIGAS<br/><span style="font-size:9px; font-weight:normal;">Auditor, AFA</span></div>
            </div>
            <div>
              <div class="signature-line">JUANITO BACALSO<br/><span style="font-size:9px; font-weight:normal;">President, AFA</span></div>
            </div>
          </div>

          <div class="footer">
            <p>Generated on \${new Date().toLocaleDateString()} \${new Date().toLocaleTimeString()} from Barangay Alegria Farmers Association cloud ledger.</p>
            <p>© 2026 Barangay Alegria Farmers Association • Tuburan, Cebu</p>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Calculations - directly reflect live database value without falling back to static 1M
  const capitalGrant = typeof state.capitalGrant === 'number'
    ? state.capitalGrant
    : (Number(state.capitalGrant) || 0);
  
  // Grant editing state
  const [isEditingGrant, setIsEditingGrant] = useState(false);
  const [newGrantAmount, setNewGrantAmount] = useState(capitalGrant.toString());
  
  // Keep input field strictly synchronized whenever data arrives from PostgreSQL Cloud DB
  useEffect(() => {
    setNewGrantAmount(capitalGrant.toString());
  }, [capitalGrant]);
  
  // Calculations filtered by selected produce
  const totalExpenses = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalSales = filteredSales.reduce((sum, item) => sum + item.revenue, 0);
  
  // Overall expenditures across ALL projects (to correctly deduct from overall capital allocation)
  const overallExpensesTotal = state.expenses.reduce((sum, item) => sum + item.amount, 0);
  const remainingGrant = capitalGrant - overallExpensesTotal;
  
  // Profits/Interest generated for the selected project
  const netProfit = totalSales - totalExpenses;
  
  // Find active co-op members
  const activeMembers = members.filter(m => m.status === 'Active');
  const activeCount = activeMembers.length || 1;
  const individualDividend = netProfit > 0 ? netProfit / activeCount : 0;

  // Visual percentages of total capital used across ALL projects (safe against 0 division)
  const percentUsed = capitalGrant > 0 ? Math.min((overallExpensesTotal / capitalGrant) * 100, 100) : 0;

  // Dynamic categories list based on produce
  const getDynamicExpenseCategories = (produce: string) => {
    if (produce === 'Hog Raising') {
      return [
        { value: 'Feeds', label: 'Feeds (Pagkaon sa Baboy)' },
        { value: 'Piglets', label: 'Piglets (Pagpalit og Liso sa Baboy)' },
        { value: 'Vitamins/Medicines', label: 'Vitamins & Medicines (Tambal/Vaccine)' },
        { value: 'Other', label: 'Other (Koral / Utilities)' }
      ];
    } else if (produce === 'Poultry Raising') {
      return [
        { value: 'Feeds', label: 'Feeds (Pagkaon sa Manok)' },
        { value: 'Chicks', label: 'Chicks (Liso/Sisiw sa Manok)' },
        { value: 'Vitamins/Medicines', label: 'Vitamins & Medicines (Tambal/Vaccine)' },
        { value: 'Other', label: 'Other (Coop repairs / Nesting boxes)' }
      ];
    } else if (produce.includes('Chairs') || produce.includes('Lingkoranan')) {
      return [
        { value: 'New Chairs', label: 'Bag-ong Lingkoranan (Purchase of Plastic Chairs)' },
        { value: 'Repairs & Maintenance', label: 'Pag-ayo ug Paglimpyo (Repairs & Maintenance)' },
        { value: 'Transport', label: 'Kargada ug Paghatod (Transport & Hauling)' },
        { value: 'Other', label: 'Other (Tipiganan / Ubang Gasto)' }
      ];
    } else if (produce.includes('Sacks') || produce.includes('Sako')) {
      return [
        { value: 'New Sacks', label: 'Bag-ong Sako (Purchase of Harvest Sacks)' },
        { value: 'Washing & Drying', label: 'Paglaba ug Pagbulad (Cleaning & Maintenance)' },
        { value: 'Repairs', label: 'Pagtahi ug Pag-ayo (Repairs & Sewing)' },
        { value: 'Other', label: 'Other (Tipiganan / Ubang Gasto)' }
      ];
    } else {
      return [
        { value: 'Supplies', label: 'Supplies & Materials' },
        { value: 'Equipment', label: 'Tools & Equipment' },
        { value: 'Maintenance', label: 'Maintenance & Repairs' },
        { value: 'Other', label: 'Other Infrastructure / Tools' }
      ];
    }
  };

  const dynamicCategories = getDynamicExpenseCategories(selectedProduce);

  // Dynamic chores list based on produce
  const getDynamicChoreActivities = (produce: string) => {
    if (produce === 'Hog Raising') {
      return [
        { id: 'Feeding', label: 'Pagpakaon (Feeding)' },
        { id: 'Cleaning', label: 'Paglimpyo sa Koral' },
        { id: 'Vitamins', label: 'Paghatag og Bitamina' },
        { id: 'Water Refill', label: 'Tubig sa Trough' },
      ];
    } else if (produce === 'Poultry Raising') {
      return [
        { id: 'Feeding', label: 'Feeding Tasks (Pagpakaon)' },
        { id: 'Cleaning', label: 'Coop Cleanup (Paglimpyo)' },
        { id: 'Egg Harvesting', label: 'Egg Harvesting (Pangitlog)' },
        { id: 'Water Refill', label: 'Fresh Water Refill' },
      ];
    } else if (produce.includes('Chairs') || produce.includes('Lingkoranan')) {
      return [
        { id: 'Inventory Count', label: 'Pagsusi sa Kadaghanon (Chair Count)' },
        { id: 'Cleaning', label: 'Pagtrapo ug Paglimpyo (Sanitizing)' },
        { id: 'Dispatch', label: 'Pagpagawas / Pag-arkila (Rental Dispatch)' },
        { id: 'Return Inspection', label: 'Pagsusi inig Balik (Return Inspection)' },
      ];
    } else if (produce.includes('Sacks') || produce.includes('Sako')) {
      return [
        { id: 'Inventory Count', label: 'Pagsusi sa Sako (Sack Count)' },
        { id: 'Sorting & Bundling', label: 'Pagbugkos matag 50 (Bundling)' },
        { id: 'Dispatch', label: 'Pagpagawas para sa Ting-ani (Rental Dispatch)' },
        { id: 'Return & Wash', label: 'Pagsusi ug Pagbulad (Return & Wash)' },
      ];
    } else {
      return [
        { id: 'Maintenance', label: 'Maintenance & Inspection' },
        { id: 'Cleaning', label: 'Cleaning & Organization' },
        { id: 'Inventory', label: 'Stock & Inventory Check' },
        { id: 'Service', label: 'Rental Service Operation' },
      ];
    }
  };

  const dynamicChoreList = getDynamicChoreActivities(selectedProduce);

  // Colors based on theme mode (highly optimized for senior citizens on the member side)
  const theme = {
    bg: 'bg-[#F7F4EF] text-[#1B4332]',
    cardBg: 'bg-[#F7F4EF] border-[#D5CFC1]',
    cardHover: 'hover:border-[#BBD8C7] hover:bg-[#FBF9F5]',
    inputBg: 'bg-white border-[#D5CFC1] text-[#1B4332] text-sm font-extrabold',
    headerText: 'text-[#1B4332] text-base sm:text-xl font-black',
    subText: 'text-[#4A5F57] font-bold text-xs sm:text-sm',
    accentText: 'text-[#1B4332]',
    accentBg: 'bg-[#EAF4EC] text-[#1B4332]',
    primaryButton: 'bg-[#1B4332] hover:bg-[#143326] text-white py-3 px-6 text-sm font-black rounded-xl shadow-md',
    badgeSecondary: 'bg-[#EAF4EC] text-[#1B4332] border-[#CFE4D7] font-extrabold'
  };

  const handleChoreToggle = (activity: string) => {
    if (choreChoreActivities.includes(activity)) {
      setChoreChoreActivities(choreChoreActivities.filter(a => a !== activity));
    } else {
      setChoreChoreActivities([...choreChoreActivities, activity]);
    }
  };

  const handleChoreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (choreChoreActivities.length === 0) return;
    onAddChoreLog({
      produce: selectedProduce,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      batchName: choreBatchName,
      checkedBy: choreCheckedBy || 'Mag-uuma',
      activities: choreChoreActivities,
      notes: choreNotes.trim() || undefined
    });
    setChoreChoreActivities([]);
    setChoreNotes('');
  };

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expAmount || parseFloat(expAmount) <= 0 || !expDesc.trim()) return;
    const yr = parseInt(expDate.substring(0, 4));
    if (closedYears.includes(yr)) {
      setExpenseDateError(`Sirado ang Libro: Ang financial book sa ${yr} gisirado na niadtong Disyembre.`);
      return;
    }
    onAddExpense({
      produce: selectedProduce,
      category: expCategory,
      description: expDesc,
      amount: parseFloat(expAmount),
      date: expDate
    });
    setExpDesc('');
    setExpAmount('');
    setExpenseDateError('');
    setShowExpenseModal(false);
  };

  const handleSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleRevenue || parseFloat(saleRevenue) <= 0 || !saleHogsCount) return;
    const yr = parseInt(saleDate.substring(0, 4));
    if (closedYears.includes(yr)) {
      setSaleDateError(`Sirado ang Libro: Ang financial book sa ${yr} gisirado na niadtong Disyembre.`);
      return;
    }
    onAddSale({
      produce: selectedProduce,
      date: saleDate,
      hogsCount: selectedProduce === 'Hog Raising' ? parseInt(saleHogsCount) : 0,
      produceCount: parseInt(saleHogsCount),
      revenue: parseFloat(saleRevenue),
      notes: saleNotes.trim() || undefined
    });
    setSaleHogsCount('');
    setSaleRevenue('');
    setSaleNotes('');
    setSaleDateError('');
    setShowSaleModal(false);
  };

  // Printable Dividend Sheet
  const handlePrintDividends = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>AFA - Hog Raising IGP Interest Dividends</title>
          <style>
            body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #2d3748; line-height: 1.5; }
            .header { text-align: center; border-bottom: 3px double #1b4332; padding-bottom: 20px; margin-bottom: 30px; }
            .header h2 { margin: 0; color: #1b4332; font-size: 20px; text-transform: uppercase; }
            .header p { margin: 5px 0 0; font-size: 12px; color: #555; }
            .title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 30px; text-decoration: underline; color: #1b4332; }
            .financial-summary { display: grid; grid-template-cols: repeat(3, 1fr); gap: 15px; background: #faf8f5; border: 1px solid #e9e4d9; padding: 15px; border-radius: 8px; margin-bottom: 30px; font-size: 12px; }
            .summary-item h4 { margin: 0; color: #666; font-size: 10px; text-transform: uppercase; }
            .summary-item p { margin: 5px 0 0; font-size: 16px; font-weight: bold; color: #1b4332; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background-color: #f7fafc; color: #1b4332; font-weight: bold; }
            .text-right { text-align: right; }
            .footer { margin-top: 50px; font-size: 11px; text-align: center; color: #718096; }
            .signature-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 50px; margin-top: 50px; text-align: center; }
            .signature-line { border-top: 1px solid #aaa; margin-top: 40px; padding-top: 5px; font-size: 12px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Alegria Farmers Association (AFA)</h2>
            <p>Tuburan, Cebu Province, Philippines • SEC Reg. No. CN2021-0812</p>
            <p><strong>INCOME GENERATING PROJECT (IGP) - HOG RAISING PORTAL</strong></p>
          </div>

          <div class="title">OFFICIAL DIVIDEND INTEREST DISTRIBUTION SHEET</div>

          <div class="financial-summary">
            <div class="summary-item">
              <h4>Total Hogs Gross Revenue (Benta)</h4>
              <p>PHP ${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div class="summary-item">
              <h4>Total Raising Cost (Capital Used)</h4>
              <p>PHP ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            <div class="summary-item">
              <h4>Accumulated Interest (Total Net Profit)</h4>
              <p>PHP ${netProfit > 0 ? netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}</p>
            </div>
          </div>

          <div style="background: #e6f4ea; border: 1px solid #a3cfbb; padding: 10px 14px; border-radius: 6px; margin-bottom: 20px; font-size: 11px; color: #0f5132;">
            <strong>CAPITAL & BUDGET ORIGIN (WHERE BUDGET WAS TAKEN FROM):</strong> Revolving Livelihood Capital funded by <strong>DOLE Integrated Livelihood Program (DILP)</strong> & Municipal Agriculture Assistance. Net dividends are distributed from livelihood and rental proceeds.
          </div>

          <p style="font-size: 12px; margin-bottom: 15px;">
            Pursuant to association regulations, all members who actively participate in the rotational <strong>Group Care System (Sistemang Bayanihan)</strong> to feed, clean, and manage the communal hogs are designated as benefactors of the interest generated. The accumulated net interest of <strong>PHP ${(netProfit > 0 ? netProfit : 0).toLocaleString()}</strong> is divided equally among the <strong>${activeCount}</strong> active registered farmers:
          </p>

          <table>
            <thead>
              <tr>
                <th>Farmer Name (Miyembro sa AFA)</th>
                <th>Location (Sitio)</th>
                <th>Status</th>
                <th class="text-right">Dividend Share (PHP)</th>
                <th>Signature / Acknowledgement</th>
              </tr>
            </thead>
            <tbody>
              ${activeMembers.map(m => `
                <tr>
                  <td><strong>${m.name}</strong></td>
                  <td>${m.farmLocation}</td>
                  <td><span style="color: green; font-weight: bold;">${m.status}</span></td>
                  <td class="text-right" style="font-weight: bold; font-family: monospace;">
                    PHP ${individualDividend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style="width: 200px;"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="signature-grid">
            <div>
              <div class="signature-line">RODOLFO CLIMACO<br/><span style="font-size:10px; font-weight:normal;">Treasurer, AFA</span></div>
            </div>
            <div>
              <div class="signature-line">JUANITO BACALSO<br/><span style="font-size:10px; font-weight:normal;">President, AFA</span></div>
            </div>
          </div>

          <div class="footer">
            <p>Generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} from the Barangay Alegria Farmers Association cloud ledger.</p>
            <p>© 2026 Barangay Alegria Farmers Association • Tuburan, Cebu</p>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div id="hog-raising-igp-container" className="space-y-6">
      
      {/* SECTION HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 text-left">
        <div>
          <h2 className={`text-xl font-black ${theme.headerText} flex items-center gap-2.5 font-display`}>
            {selectedProduce.includes('Rental') || selectedProduce.includes('Lingkoranan') || selectedProduce.includes('Sako') ? (
              <Boxes className={`w-6 h-6 ${isOfficerMode ? 'text-amber-400' : 'text-amber-600'}`} />
            ) : (
              <Briefcase className={`w-6 h-6 ${isOfficerMode ? 'text-emerald-400' : 'text-[#2D6A4F]'}`} />
            )}            <span>
              {getProduceProjectName(selectedProduce)}
            </span>
          </h2>
          <p className={`text-xs ${theme.subText} mt-1 font-medium`}>
            Track the initial capital, expenses, rental & sales logs, and member dividends for <strong>{selectedProduce}</strong>.          </p>
        </div>

        {/* Dynamic Badge */}
        <div className="flex items-center gap-2">
          <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dynamic Livelihood Projects</span>
          </span>
        </div>
      </div>

      {/* PROJECT SELECTOR & REGISTRATION BAR */}
      <div className={`p-4 rounded-2xl border ${theme.cardBg} flex flex-col md:flex-row items-center justify-between gap-4 text-left`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
          <span className="text-xs sm:text-sm font-black uppercase text-[#1B4332] whitespace-nowrap flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#1B4332]" />
            Pilia ang Proyekto (Select Project):
          </span>
          <select
            value={selectedProduce}
            onChange={(e) => {
              setSelectedProduce(e.target.value);
              // Reset category to the first one available in the new produce
              const newCats = getDynamicExpenseCategories(e.target.value);
              if (newCats.length > 0) {
                setExpCategory(newCats[0].value);
              }
            }}
            aria-label="Select project"
            className={`w-full sm:w-64 px-3.5 py-2.5 text-sm rounded-xl border ${theme.inputBg} focus:outline-none focus:ring-2 focus:ring-[#1B4332] font-extrabold text-[#1B4332] bg-white`}
            style={{ color: '#1B4332', backgroundColor: '#ffffff' }}
          >
            {produces.map((prod) => (
              <option key={prod} value={prod} className="text-[#1B4332] bg-white" style={{ color: '#1B4332' }}>
                {getProduceProjectName(prod)}
              </option>
            ))}
          </select>
        </div>

        {/* Add Produce Action (for Treasurer or Officers) */}
        {isTreasurerOrOfficer && (
          <button
            type="button"
            onClick={() => setShowAddProduceModal(true)}
            className={`flex items-center gap-1.5 text-xs font-black px-4.5 py-2.5 rounded-xl border transition-all cursor-pointer shadow-sm ${
              isOfficerMode
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent'
                : 'bg-[#1B4332] hover:bg-[#143326] text-white border-transparent'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Dugang Bag-ong Produce (Add Project)</span>
          </button>
        )}
      </div>

      {/* ADD PRODUCE MODAL */}
      {showAddProduceModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-fade-in text-left">
          <div className="bg-[#F7F4EF] border border-[#D5CFC1] w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-black text-[#1B4332] uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span>Dugang Bag-ong Proyekto sa Asosasyon</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddProduceModal(false)}
                className="text-[#4A5F57] hover:text-[#1B4332] text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4 font-semibold leading-relaxed">
              I-register ang bag-ong livelihood project o kagamitan nga abangan (e.g., Poultry Raising, Sound System Rental, Tent Rental, Mushrooms). Kini makapahimo sa asosasyon nga dynamic ug makasulod og daghang matang sa income projects.            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newProduceName.trim()) return;
                onAddProduce?.(newProduceName.trim());
                setSelectedProduce(newProduceName.trim());
                const newCats = getDynamicExpenseCategories(newProduceName.trim());
                if (newCats.length > 0) {
                  setExpCategory(newCats[0].value);
                }
                setNewProduceName('');
                setShowAddProduceModal(false);
              }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-[#1B4332] uppercase">Ngalan sa Proyekto / Produce Name</label>
                <input
                  type="text"
                  value={newProduceName}
                  onChange={(e) => setNewProduceName(e.target.value)}
                  placeholder="e.g., Poultry Raising, Tent Rental, Mushrooms, Corn"
                  required
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-[#1B4332] focus:outline-none focus:border-emerald-500 font-sans font-bold"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2 font-bold text-xs">
                <button
                  type="button"
                  onClick={() => setShowAddProduceModal(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-[#1B4332] rounded-xl transition-all cursor-pointer border border-slate-300"
                >
                  Kansela
                </button>
                <button
                  type="submit"
                  className="px-4.5 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl transition-all cursor-pointer shadow-md font-black"
                >
                  I-register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* METRIC CARDS FOR FINANCIAL BREAKDOWN */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 text-left">
        
        {/* Capital Allocation Card */}
        <div className={`p-4.5 rounded-2xl border ${theme.cardBg} flex flex-col justify-between space-y-2 shadow-sm relative overflow-hidden`}>
          <div>
            <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block">Capital Allocation</span>
            {isEditingGrant ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                const amt = parseFloat(newGrantAmount);
                if (!isNaN(amt) && amt >= 0) {
                  onUpdateCapitalGrant?.(amt);
                  setIsEditingGrant(false);
                }
              }} className="mt-2 space-y-2 relative z-10">
                <input
                  type="number"
                  value={newGrantAmount}
                  onChange={(e) => setNewGrantAmount(e.target.value)}
                  className={`w-full px-3 py-1.5 text-sm rounded-lg border ${theme.inputBg} font-mono focus:outline-none focus:ring-1 focus:ring-[#1B4332]`}
                  placeholder="Isulat ang kantidad"
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg cursor-pointer shadow-sm"
                  >
                    I-save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingGrant(false);
                      setNewGrantAmount(capitalGrant.toString());
                    }}
                    className="px-3 py-1 bg-slate-500 hover:bg-slate-400 text-white text-xs font-black rounded-lg cursor-pointer"
                  >
                    Kansela
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between mt-1 gap-2">
                <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 block font-mono">
                  PHP {capitalGrant.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {isTreasurerOrOfficer && (
                  <button
                    onClick={() => {
                      setNewGrantAmount(capitalGrant.toString());
                      setIsEditingGrant(true);
                    }}
                    className="text-xs font-extrabold text-[#E65100] dark:text-amber-400 hover:underline cursor-pointer bg-[#FFE0B2] dark:bg-amber-950 px-2 py-1 rounded-lg shrink-0 border border-[#FFCC80]"
                  >
                    Usba (Edit)
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-xs font-bold text-slate-700 dark:text-slate-350">
            <span>Sumpay sa Database:</span>
            <span className="font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Live Database Value</span>
            </span>
          </div>
        </div>

        {/* Expenses (Capital Used) Card */}
        <div className={`p-4.5 rounded-2xl border ${theme.cardBg} flex flex-col justify-between space-y-2 shadow-sm relative overflow-hidden`}>
          <div>
            <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block">Capital Spent (Gasto sa {selectedProduceLocalName})</span>
            <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 block mt-1 font-mono">
              - PHP {totalExpenses.toLocaleString()}
            </span>
          </div>
          {/* Progress Bar of Capital Spent */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 font-bold">
              <span>Nagamit na nga Kapital:</span>
              <span>{percentUsed.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-rose-600 h-full transition-all duration-500" 
                style={{ width: `${percentUsed}%` }}
              />
            </div>
          </div>
        </div>

        {/* Remaining Capital Card */}
        <div className={`p-4.5 rounded-2xl border ${theme.cardBg} flex flex-col justify-between space-y-2 shadow-sm relative overflow-hidden`}>
          <div>
            <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block">Sobra sa Kapital (Remaining)</span>
            <span className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 block mt-1 font-mono">
              PHP {remainingGrant.toLocaleString()}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>Para sa {selectedProduceLocalName} operations</span>
            <span className="font-extrabold text-blue-700 dark:text-blue-400">Balido</span>
          </div>
        </div>

        {/* Accumulated Interest / Dividend per Member Card */}
        <div className={`p-4.5 rounded-2xl border ${theme.cardBg} flex flex-col justify-between space-y-2 shadow-sm relative overflow-hidden bg-gradient-to-br from-emerald-500/5 to-transparent`}>
          <div>
            <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider block">Interes / Dividends matag Miyembro</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400 block mt-1 font-mono">
              PHP {individualDividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 items-center">
            <span>Total Tubo: <strong className="text-emerald-700 font-mono">PHP {(netProfit > 0 ? netProfit : 0).toLocaleString()}</strong></span>
            <span className="bg-emerald-600/15 text-emerald-800 dark:text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded uppercase">
              Para sa Tanan
            </span>
          </div>
        </div>

      </div>

      {/* NAVIGATION TABS FOR IGP PORTAL */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 select-none overflow-x-auto no-print">
        {[
          { id: 'overview', label: 'Summary & Breakdown', icon: selectedProduce.includes('Rental') ? Boxes : Briefcase },          { id: 'schedule', label: 'Rotational Group Schedule', icon: Calendar },
          { id: 'chores', label: 'Daily Care Check-in', icon: Activity },
          { id: 'dividends', label: 'Interest Dividends', icon: Award },
          { id: 'reports', label: 'Quarterly & December Closing', icon: ShieldCheck },
          { id: 'ledger', label: 'IGP Financial Ledger', icon: FileText, adminOnly: true },        ].map((tab) => {
          if (tab.adminOnly && !isTreasurerOrOfficer) return null;
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm sm:text-base font-black transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
                isActive
                  ? 'border-[#1B4332] text-[#1B4332] bg-[#EAF4EC] rounded-t-xl'
                  : 'border-transparent text-[#4A5F57] hover:text-[#1B4332] hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT PANELS */}
      <div className="text-left">
        
        {/* TAB 1: SUMMARY & CAPITAL USED BREAKDOWN */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Breakdown graph / details */}
            <div className={`lg:col-span-7 p-6 rounded-3xl border ${theme.cardBg} space-y-6`}>
              <div>
                <h3 className="font-extrabold text-base text-slate-800 dark:text-white">Breakdown sa Gastos sa IGP Capital</h3>
                <p className="text-xs text-slate-400 mt-1">Giunsa paggamit ang pundo para sa {selectedProduce} sumpay sa kagamitan, supplies, ug operating budget.</p>
              </div>

              {/* Graphical Visual Bars */}
              <div className="space-y-4">
                {dynamicCategories.map((cat, i) => {
                  const catExpenses = filteredExpenses.filter(e => e.category === cat.value).reduce((sum, e) => sum + e.amount, 0);
                  const catPercent = totalExpenses > 0 ? (catExpenses / totalExpenses) * 100 : 0;
                  const colors = ['bg-amber-500', 'bg-emerald-500', 'bg-pink-500', 'bg-blue-500', 'bg-purple-500'];
                  const colorClass = colors[i % colors.length];

                  return (
                    <div key={cat.value} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <span className={`w-2.5 h-2.5 ${colorClass} rounded-full`} />
                          {cat.label}
                        </span>
                        <span className="font-mono text-slate-500 font-bold">
                          PHP {catExpenses.toLocaleString()} ({catPercent.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-150 dark:bg-slate-950 h-2.5 rounded-full overflow-hidden">
                        <div className={`${colorClass} h-full`} style={{ width: `${catPercent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Informative advice */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-850 flex gap-3 text-xs">
                <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-slate-500 dark:text-slate-400 space-y-1">
                  <p className="font-bold text-slate-800 dark:text-slate-300">Giunsa Pagkwenta ang Tubo (Interest)?</p>
                  <p className="leading-relaxed">
                    Ang tanan nga gasto (buying supplies, equipment, feeds) ibawas sa capital pundo sa IGP. Kon dunay kita o halin gikan sa abang ug benta, ang halin isulod sa pundo. Ang makuha nga deperensya (Net Profit/Surplus) mao ang i-apod-apod sa matag mag-uuma nga nakigbahin sa mga buluhaton!
                  </p>
                </div>
              </div>
            </div>

            {/* General Project Info / Quick Status */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Project Status */}
              <div className={`p-5 rounded-3xl border ${theme.cardBg} space-y-4`}>
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider border-b border-slate-150 dark:border-slate-850 pb-2 flex items-center gap-2">
                  <Activity className="w-4.5 h-4.5 text-emerald-500" />
                  <span>Kondisyon sa Project (IGP Status Card)</span>
                </h4>

                <div className={`grid grid-cols-2 gap-4 text-xs font-medium ${isOfficerMode ? 'text-slate-400' : 'text-[#4B6259]'}`}>
                  <div className={`p-3 rounded-xl border ${isOfficerMode ? 'bg-slate-950/40 border-slate-850' : 'bg-[#F5FAF6] border-[#E9E4D9]'}`}>
                    <span>Active Hogs in Pen</span>
                    <strong className={`block text-lg font-extrabold mt-1 ${isOfficerMode ? 'text-white' : 'text-[#1B4332]'}`}>17 Baboy</strong>
                  </div>
                  <div className={`p-3 rounded-xl border ${isOfficerMode ? 'bg-slate-950/40 border-slate-850' : 'bg-[#F5FAF6] border-[#E9E4D9]'}`}>
                    <span>Hogs Sold (Nahalin)</span>
                    <strong className={`block text-lg font-extrabold mt-1 ${isOfficerMode ? 'text-emerald-400' : 'text-[#2D6A4F]'}`}>8 Baboy</strong>
                  </div>
                </div>

                <div className="space-y-2 text-xs leading-relaxed text-slate-500">
                  <p>
                    <strong>Project Reference Code:</strong> <span className="font-mono text-slate-700 dark:text-slate-200 font-bold bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 rounded border">AFA-2026-IGP-01</span>
                  </p>
                  <p>
                    <strong>Project Site:</strong> Communal Piggery Facility, Barangay Alegria (Duol sa Barangay Hall).
                  </p>
                  <p>
                    <strong>Rotational Caretakers:</strong> 6 ka mga rehistradong mag-uuma ang napa-ilalom sa schedule sa pag-alaga.
                  </p>
                </div>
              </div>

              {/* Bayanihan Promise Banner */}
              <div className={`p-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.02] text-left space-y-3`}>
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-emerald-500 shrink-0" />
                  <h4 className="font-extrabold text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    Sistemang Bayanihan (Group System)
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Ang matag miyembro sa Barangay Alegria Farmers Association adunay obligasyon nga mosunod sa adlaw sa iyang batch para sa paglimpyo ug pagpakaon sa mga baboy. Tungod niini nga sakripisyo, ang interes sa tibuok proyekto gikuha para sa tanan!
                </p>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: ROTATIONAL GROUP CARING SCHEDULES */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <div className={`p-5 rounded-3xl border ${theme.cardBg} space-y-4`}>
              <div>
                <h3 className="font-extrabold text-base text-slate-800 dark:text-white">Schedule sa Pag-alaga sa Baboy (Group Schedule)</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Kini ang listahan sa mga batch ug mga mag-uuma nga gitahasan sa pagpakaon, pag-ayo, ug pagpabakuna sa mga baboy matag adlaw sa semana.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {state.groups.map((grp) => {
                  return (
                    <div 
                      key={grp.id}
                      className={`border rounded-2xl p-5 ${theme.cardBg} hover:border-[#1B4332] dark:hover:border-slate-500 transition-all flex flex-col justify-between`}
                    >
                      <div>
                        <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-850 pb-2.5 mb-3.5">
                          <h4 className="font-extrabold text-sm text-[#1B4332] dark:text-emerald-400">{grp.name}</h4>
                          <span className="bg-[#FFF3E0] dark:bg-amber-500/10 text-[#E65100] dark:text-amber-400 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                            Rotation
                          </span>
                        </div>

                        {/* Schedule Days */}
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 mb-4">
                          <Calendar className="w-4 h-4 text-emerald-500" />
                          <span>Adlaw sa Pagkaon: {grp.scheduleDays.join(', ')}</span>
                        </div>

                        {/* Members assigned */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Mga Miyembro sa Batch:</label>
                          <div className="space-y-1">
                            {grp.members.map((memName, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                <span>{memName}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Footer Badge */}
                      <div className="mt-6 pt-3 border-t border-slate-150 dark:border-slate-850 text-[10px] text-slate-400 flex justify-between items-center">
                        <span>Group Status:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">ON DUTY SCHEDULE</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* General Reminder */}
              <div className="p-4 bg-[#F7F4EF] rounded-2xl border border-[#D5CFC1] flex gap-3 text-xs mt-4">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[#4A5F57] leading-relaxed">
                  <strong className="text-[#1B4332]">Importante:</strong> Kon duna moy dinalian nga buluhaton sa inyong uma sa adlaw sa inyong duty schedule sa piggery, mahimo kamo makig-swap o makig-sulti sa laing batch nga magpuli una kaninyo sa pag-feeding, apan kinahanglan ninyong pahibaw-on ang PIO o Secretary.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DAILY CHORE AND FEEDING LOGS */}
        {activeTab === 'chores' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LHS: Log chore check-in form */}
            <div className={`lg:col-span-5 p-5 rounded-3xl border ${theme.cardBg} space-y-4`}>
              <div>
                <h3 className="font-extrabold text-base text-slate-800 dark:text-white">Pag-log sa Buluhaton (Chore Check-in)</h3>
                <p className="text-xs text-slate-400 mt-1">Isulat kon nakakaon ba, nakalimpyo, ug nakahatag kaba og bitamina karong adlawa.</p>
              </div>

              <form onSubmit={handleChoreSubmit} className="space-y-4 text-xs font-medium text-slate-300">
                {/* Batch selection */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase">Imong Batch (Assigned Group)</label>
                  <select
                    value={choreBatchName}
                    onChange={(e) => setChoreBatchName(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl focus:outline-none ${theme.inputBg} font-bold`}
                  >
                    {state.groups.map(g => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </div>

                {/* Name Selection */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase">Gi-check ni (Checked / Logged By)</label>
                  <select
                    value={choreCheckedBy}
                    onChange={(e) => setChoreCheckedBy(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl focus:outline-none ${theme.inputBg} font-bold`}
                  >
                    <option value="">-- Pilia imong ngalan (Select Name) --</option>
                    {members.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {/* Activities Done Checkboxes */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase">MGA BULUHATON NGA NA-HUMAN (ACTIVITIES COMPLETED):</label>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                    {dynamicChoreList.map((act) => {
                      const isChecked = choreChoreActivities.includes(act.id);
                      return (
                        <button
                          type="button"
                          key={act.id}
                          onClick={() => handleChoreToggle(act.id)}
                          className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                            isChecked
                              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/35'
                          }`}
                        >
                          <span>{act.label}</span>
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase">Dugang nga Obserbasyon (Notes/Observations)</label>
                  <textarea
                    rows={2}
                    placeholder={
                      selectedProduce === 'Hog Raising'
                        ? 'e.g., Ang tanan nga baboy maayo og paminaw. Kusog mokaon.'
                        : selectedProduce === 'Poultry Raising'
                        ? 'e.g., Ang tanan nga manok maayo og paminaw. Walay masakiton.'
                        : 'e.g., Gi-check ang mga kahimtang sa pananom/hayop karong adlawa.'
                    }
                    value={choreNotes}
                    onChange={(e) => setChoreNotes(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl focus:outline-none ${theme.inputBg} font-sans`}
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={choreChoreActivities.length === 0 || !choreCheckedBy}
                  className={`w-full py-2.5 rounded-xl text-xs font-black transition-colors cursor-pointer text-center ${theme.primaryButton} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  I-submit ang Care Log (Save Log)
                </button>
              </form>
            </div>

            {/* RHS: Recent Chore History */}
            <div className={`lg:col-span-7 p-5 rounded-3xl border ${theme.cardBg} space-y-4`}>
              <div>
                <h3 className="font-extrabold text-base text-slate-800 dark:text-white">Lista sa bag-ong Pag-atiman (Daily Care Logs)</h3>
                <p className="text-xs text-slate-400 mt-1">Kini ang real-time feed nga nagpakita kon kinsa ang mi-alaga sa {selectedProduce}.</p>
              </div>

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {filteredChoreLogs.length > 0 ? (
                  filteredChoreLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className="p-3.5 bg-[#F7F4EF] rounded-2xl border border-[#D5CFC1] space-y-2 text-xs shadow-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <strong className="text-[#1B4332] block text-sm">{log.checkedBy}</strong>
                          <span className="text-[10px] text-[#4A5F57] font-bold bg-white px-1.5 py-0.5 rounded border border-[#D5CFC1]">
                            {log.batchName}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#4A5F57] font-mono font-semibold">{log.date} @ {log.time}</span>
                      </div>

                      {/* Activities badges */}
                      <div className="flex flex-wrap gap-1">
                        {log.activities.map((act, i) => (
                          <span 
                            key={i} 
                            className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[9px] font-black px-1.5 py-0.5 rounded"
                          >
                            ✓ {dynamicChoreList.find(d => d.id === act)?.label || act}
                          </span>
                        ))}
                      </div>

                      {/* Notes if any */}
                      {log.notes && (
                        <p className="text-[11px] text-[#1B4332] italic mt-1 bg-white p-2 rounded-lg border border-[#D5CFC1] leading-normal">
                          "{log.notes}"
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed p-8 rounded-2xl text-center">
                    <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Wala pay care logs nga narekord para sa {selectedProduce} karong adlawa.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: INTEREST DIVIDENDS & MEMBER DISTRIBUTION */}
        {activeTab === 'dividends' && (
          <div className="space-y-6">
            <div className={`p-6 rounded-3xl border ${theme.cardBg} space-y-6`}>
              
              {/* Header inside */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-150 dark:border-slate-850 pb-4">
                <div>
                  <h3 className="font-extrabold text-base text-slate-800 dark:text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <span>Net Income Distribution & December Dividends (50/30/20 Formula)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    50% Handlers • 30% FCCT Cooperative Deposit (December Cut) • 20% Association Reserve • 5% Dispersal Risk Pool
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    id="calc-attendance-dividend-btn"
                    onClick={() => setShowDividendCalcModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all cursor-pointer"
                  >
                    <Calculator className="w-4 h-4" />
                    <span>Attendance Dividend Engine</span>
                  </button>

                  <button
                    id="print-dividend-btn"
                    onClick={handlePrintDividends}
                    className={`flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-black border transition-colors cursor-pointer ${
                      isOfficerMode
                        ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700'
                        : 'bg-white hover:bg-slate-100 text-slate-800 border-[#D5CFC1]'
                    }`}
                  >
                    <Printer className="w-4 h-4" />
                    <span>I-print ang Report</span>
                  </button>
                </div>
              </div>

              {/* 4-WAY FORMULA HIGHLIGHT CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 bg-[#ECF7EF] border border-[#B7DCC1] rounded-2xl space-y-1 shadow-sm">
                  <span className="text-[10px] font-black text-[#1B4332] uppercase block">50% Handlers / Raisers</span>
                  <div className="text-base font-black text-[#1B4332] font-mono">
                    ₱{((netProfit > 0 ? netProfit : 0) * 0.50).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-[10px] text-[#1B4332] leading-tight">Direktang bahin sa mga mi-atiman, naglawog ug nag-limpyo sa piggery.</p>
                </div>

                <div className="p-3.5 bg-[#EEF6FF] border border-[#B7CFE8] rounded-2xl space-y-1 shadow-sm">
                  <span className="text-[10px] font-black text-[#1B4332] uppercase block">30% FCCT Deposit (December)</span>
                  <div className="text-base font-black text-[#1B4332] font-mono">
                    ₱{((netProfit > 0 ? netProfit : 0) * 0.30).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-[10px] text-[#1B4332] leading-tight">Ide-deposit sa FCCT Bank, i-apod-apod sa Disyembre base sa attendance.</p>
                </div>

                <div className="p-3.5 bg-[#FFF7EA] border border-[#F0D7A6] rounded-2xl space-y-1 shadow-sm">
                  <span className="text-[10px] font-black text-[#1B4332] uppercase block">20% Association General</span>
                  <div className="text-base font-black text-[#1B4332] font-mono">
                    ₱{(((netProfit > 0 ? netProfit : 0) * 0.20) + (netProfit > 0 ? 10000 : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-[10px] text-[#1B4332] leading-tight">Pundo sa asosasyon + ₱10,000 allowance para sa operational expenses.</p>
                </div>

                <div className="p-3.5 bg-[#F4ECFF] border border-[#D7C5F2] rounded-2xl space-y-1 shadow-sm">
                  <span className="text-[10px] font-black text-[#1B4332] uppercase block">5% Dispersal & Risk Pool</span>
                  <div className="text-base font-black text-[#1B4332] font-mono">
                    ₱{((netProfit > 0 ? netProfit : 0) * 0.05).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-[10px] text-[#1B4332] leading-tight">Insurance reserve para sa mortality ug emergency replacement sa baboy.</p>
                </div>
              </div>

              {/* Information disclaimer */}
              <div className="p-4 bg-emerald-500/[0.02] rounded-2xl border border-emerald-500/10 text-xs text-slate-500 dark:text-slate-400 leading-relaxed space-y-1">
                <p className="font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">PAGPASABOT MAHITUNGOD SA DIVIDENDS & ATTENDANCE RULE:</p>
                <p>
                  Ang 30% nga pundo (Cooperative Deposit) i-release inig abot sa <strong>Disyembre</strong> ug gibahin-bahin base sa <strong>Attendance sa mga Regular Assembly & Tigum</strong>. Ang mga miyembro nga adunay absent dili makakuha sa ilang bahin para sa maong bulan, ug ang ilang bahin i-reallocate isip dugang incentive sa mga aktibong miyembro.
                </p>
              </div>

              {/* Members Share Listing */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-950 font-black text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-150 dark:border-slate-850">
                    <tr>
                      <th className="p-4 rounded-l-xl">Miyembro sa AFA (Farmer Name)</th>
                      <th className="p-4">Lokasyon (Sitio)</th>
                      <th className="p-4">Grupo sa Caretakers (Batch)</th>
                      <th className="p-4">Membership Status</th>
                      <th className="p-4 rounded-r-xl text-right">Estimated 30% Pool Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-semibold text-slate-600 dark:text-slate-200">
                    {activeMembers.map((m) => {
                      const memberBatch = state.groups.find(g => g.members.includes(m.name))?.name || 'Weekend Rotation';
                      const estimated30PercentShare = activeCount > 0 ? ((netProfit > 0 ? netProfit : 0) * 0.30) / activeCount : 0;
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                          <td className="p-4 font-extrabold text-slate-800 dark:text-white">{m.name}</td>
                          <td className="p-4 text-slate-400">{m.farmLocation}</td>
                          <td className="p-4 font-bold text-[#1B4332] dark:text-emerald-400">{memberBatch}</td>
                          <td className="p-4">
                            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                              Active
                            </span>
                          </td>
                          <td className="p-4 text-right text-emerald-600 dark:text-emerald-400 font-extrabold font-mono text-sm">
                            PHP {estimated30PercentShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Total calculations under */}
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 text-xs">
                <span className="text-slate-400 font-bold">Total Net Profit / Tubo (Disyembre):</span>
                <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                  PHP {netProfit > 0 ? netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                </span>
              </div>

            </div>
          </div>
        )}

        {/* TAB 5: TREASURER PIG LEDGER (EXPENSES & SALES LOGS) */}
        {activeTab === 'ledger' && (
          <div className="space-y-6">
            
            {/* Quick Actions and Logs */}
            <div className={`p-5 rounded-3xl border ${theme.cardBg} space-y-4`}>
              
              {/* Actions Header Row */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="font-extrabold text-base text-slate-800 dark:text-white">IGP Financial Ledger (Gasto, Abang ug Halin)</h3>
                  <p className="text-xs text-slate-400 mt-1">Isulat ang mga gasto sa {selectedProduce}, lakip ang kita o halin gikan sa abang ug benta.</p>                </div>

                <div className="flex gap-2 w-full sm:w-auto shrink-0 font-bold">
                  <button
                    id="add-pig-expense-btn"
                    onClick={() => setShowExpenseModal(true)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 text-xs bg-rose-100 hover:bg-rose-200 text-[#1B4332] rounded-xl shadow-sm transition-all cursor-pointer border border-rose-300 font-black"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Log IGP Expense</span>                  </button>
                  <button
                    id="add-hog-sale-btn"
                    onClick={() => setShowSaleModal(true)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{selectedProduce.includes('Rental') || selectedProduce.includes('Lingkoranan') || selectedProduce.includes('Sako') ? 'Record Rental Income' : 'Record Sale / Income'}</span>                  </button>
                </div>
              </div>

              {/* Table ledger details */}
              <div className="overflow-x-auto pt-1">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-950 font-black text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-150 dark:border-slate-850">
                    <tr>
                      <th className="p-4 rounded-l-xl">Type</th>
                      <th className="p-4">Kategorya (Category)</th>
                      <th className="p-4">Description / Receipt Note</th>
                      <th className="p-4">Adlaw (Date)</th>
                      <th className="p-4">Quantity (Kadaghanon)</th>
                      <th className="p-4 rounded-r-xl text-right">Kantidad (Amount PHP)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-semibold text-slate-600 dark:text-slate-200">
                    {/* Combine Expenses and Sales sorted by date descending */}
                    {[
                      ...state.expenses.map(e => ({ ...e, type: 'expense' as const, qty: undefined })),
                      ...state.sales.map(s => ({ ...s, type: 'income' as const, category: s.produce || 'IGP Income', description: s.notes || (s.produce?.includes('Rental') || s.produce?.includes('Lingkoranan') || s.produce?.includes('Sako') ? `Abang sa ${s.produceCount || s.hogsCount} ka buok.` : `Sold ${s.hogsCount} mature units.`), amount: s.revenue, qty: s.produceCount || s.hogsCount }))
                    ]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((item, idx) => {
                      const isExp = item.type === 'expense';
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                          <td className="p-4">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                              isExp ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'
                            }`}>
                              {isExp ? 'Expense' : 'Sale'}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-slate-700 dark:text-slate-300">{item.category}</td>
                          <td className="p-4 text-slate-400 max-w-xs truncate" title={item.description}>{item.description}</td>
                          <td className="p-4 text-slate-400 font-mono">{item.date}</td>
                          <td className="p-4 text-slate-400 font-bold">{item.qty || '-'}</td>
                          <td className={`p-4 text-right font-extrabold font-mono text-sm ${isExp ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {isExp ? '-' : '+'} PHP {item.amount.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>

          </div>
        )}

        {/* TAB 6: QUARTERLY REPORTS & DECEMBER CLOSING */}
        {activeTab === 'reports' && (
          <div className="space-y-6 animate-fade-in text-left">
            <div className={`p-6 rounded-3xl border ${theme.cardBg} space-y-6`}>
              
              {/* Header inside reports tab */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-150 dark:border-slate-850 pb-4">
                <div>
                  <h3 className="font-extrabold text-base text-slate-800 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    <span>Quarterly Proceeds & December Book Closing</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Bilingual summary of hog-raising proceeds per quarter, with year-end closing controls.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePrintQuarterlyReport(reportYear)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border transition-colors cursor-pointer ${
                      isOfficerMode
                        ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700'
                        : 'bg-white hover:bg-slate-100 text-slate-800 border-[#D5CFC1]'
                    }`}
                  >
                    <Printer className="w-4 h-4" />
                    <span>I-print ang Report ({reportYear})</span>
                  </button>
                </div>
              </div>

              {/* Year Selectors & Book Closing Stamp Row */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-5 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Pilia ang Tuig (Select Year):</label>
                  <div className="flex gap-2 flex-wrap">
                    {[2024, 2025, 2026].map(yr => {
                      const isYrClosed = closedYears.includes(yr);
                      const isCurrentSelected = reportYear === yr;
                      return (
                        <button
                          key={yr}
                          onClick={() => setReportYear(yr)}
                          className={`px-4 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer border ${
                            isCurrentSelected
                              ? 'bg-[#1B4332] text-white border-[#1b4332] dark:bg-emerald-600 dark:border-emerald-500'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>{yr}</span>
                          {isYrClosed && <span className="text-[10px]">Closed</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Closing Stamp Badge */}
                <div className="md:col-span-7">
                  {isSelectedYearClosed ? (
                    <div className="p-4 bg-rose-500/5 border border-rose-500/25 rounded-2xl flex items-center gap-3">
                      <div className="bg-rose-500/10 text-rose-500 p-2.5 rounded-xl border border-rose-500/30">
                        <ShieldCheck className="w-6 h-6 animate-pulse" />
                      </div>
                      <div className="text-left space-y-0.5">
                        <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block font-mono">LIBRO SA PINANSYAL GISIRADO NA (DECEMBER BOOKS CLOSED)</span>
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-bold">
                          Ang financial books sa {reportYear} opisyal nang gisirado, gi-audit ug gipirmahan niadtong Disyembre 31. Dili na mahimong usbon.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-500/5 border border-amber-500/25 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-left space-y-0.5 flex-1">
                        <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest block font-mono">KASAMTANGANG ABLI (ACTIVE & UNLOCKED)</span>
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold leading-relaxed">
                          Ang financial books sa {reportYear} kasamtangang abli ug aktibo. Mahimo pang magtala og mga gasto ug halin sa baboy.
                        </p>
                      </div>
                      
                      {isTreasurerOrOfficer && onCloseDecemberBook && (
                        <button
                          onClick={() => {
                            if (confirm(`Sigurado ka ba nga gusto nimo sirad-an ug i-lock ang Libro para sa Disyembre ${reportYear}? Dili na kini ma-usab kon ma-lock na.`)) {
                              onCloseDecemberBook(reportYear);
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl text-xs font-black bg-rose-100 hover:bg-rose-200 text-[#1B4332] shadow-md border border-rose-300 flex items-center gap-1.5 cursor-pointer shrink-0 transition-all self-start sm:self-center"
                        >
                          <span className="text-[#1B4332]">Sirad-an ang Libro (Close Books)</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Quarterly proceeds Grid */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Kalamposan ug Halin matag Kwarter (Quarterly Proceeds):</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {currentYearQuarters.map((q) => {
                    const profit = q.sales - q.expenses;
                    const isProfit = profit >= 0;
                    return (
                      <div key={q.name} className={`p-4 rounded-2xl border ${theme.cardBg} flex flex-col justify-between space-y-3 relative overflow-hidden transition-all hover:scale-[1.01] hover:shadow-sm`}>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded text-slate-500 uppercase tracking-wider">{q.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono font-bold">{q.hogsSold} sold</span>
                          </div>
                          <h5 className="text-sm font-black text-slate-800 dark:text-white leading-tight">{q.labelEng}</h5>
                          <span className="text-[10.5px] text-slate-400 block font-bold">{q.label}</span>
                        </div>

                        <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-850 pt-2.5">
                          <div className="flex justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            <span>Proceeds (Halin):</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">PHP {q.sales.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            <span>Expenses (Gasto):</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">PHP {q.expenses.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-[11px] font-black border-t border-dashed border-slate-200 dark:border-slate-800 pt-1.5">
                            <span>Net (Tubo):</span>
                            <span className={`font-mono ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                              PHP {profit.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Annual Summary Box */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">TOTAL ANNUAL PROCEEDS</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">PHP {annualTotalSales.toLocaleString()}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">TOTAL ANNUAL EXPENSES</span>
                  <span className="text-base font-black text-rose-500 font-mono">PHP {annualTotalExpenses.toLocaleString()}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">NET INTEREST PROFIT (TUBO)</span>
                  <span className={`text-base font-black font-mono ${annualTotalNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                    PHP {annualTotalNet.toLocaleString()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">MATURE HOGS SOLD</span>
                  <span className="text-base font-black text-blue-600 dark:text-blue-400 font-mono">{annualHogsSold} mature pigs</span>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: ADD PIG EXPENSE */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-left">
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-base">Record Expense ({selectedProduce})</h3>              <button 
                onClick={() => setShowExpenseModal(false)}
                className="text-[#1B4332] hover:text-[#143326] text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleExpenseSubmit} className="p-5 space-y-4 text-xs font-semibold text-[#1B4332]">
              {/* Category */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-[#1B4332] uppercase">Category</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-[#1B4332] focus:outline-none focus:border-emerald-500"
                >
                  {dynamicCategories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-[#1B4332] uppercase">Amount (PHP)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 15000"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-[#1B4332] font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-[#1B4332] uppercase">Date</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => handleExpenseDateChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-[#1B4332] focus:outline-none focus:border-emerald-500"
                  />
                  {expenseDateError && (
                    <span className="text-[10px] text-rose-500 font-bold block mt-1">{expenseDateError}</span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-[#1B4332] uppercase">Description / Receipt Notes</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g., Nakapalit og 5 ka sako nga starter feed sa Alegria Agri Supply."
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D5CFC1] rounded-xl text-[#1B4332] focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 py-2.5 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-[#1B4332] rounded-xl transition-all cursor-pointer text-center border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!expenseDateError}
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl shadow-sm transition-all text-center ${
                    expenseDateError
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-50'
                      : 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer'
                  }`}
                >
                  Record Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RECORD HOG SALE */}
      {showSaleModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-left">
            <div className="bg-slate-900 px-5 py-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-base">
                {selectedProduce.includes('Rental') || selectedProduce.includes('Lingkoranan') || selectedProduce.includes('Sako')
                  ? `Record Rental Income (${selectedProduce})`
                  : `Record Sale / Income (${selectedProduce})`}
              </h3>
              <button 
                onClick={() => setShowSaleModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaleSubmit} className="p-5 space-y-4 text-xs font-semibold text-slate-300">
              {/* Quantity sold & Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase">
                    {selectedProduce.includes('Rental') || selectedProduce.includes('Lingkoranan') || selectedProduce.includes('Sako')
                      ? 'Number of Items Rented (Kadaghanon)'
                      : 'Quantity / Units Sold'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 5"
                    value={saleHogsCount}
                    onChange={(e) => setSaleHogsCount(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase">Date of Sale</label>
                  <input
                    type="date"
                    required
                    value={saleDate}
                    onChange={(e) => handleSaleDateChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none"
                  />
                  {saleDateError && (
                    <span className="text-[10px] text-rose-500 font-bold block mt-1">{saleDateError}</span>
                  )}
                </div>
              </div>

              {/* Revenue */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase">Total Revenue (Gross PHP)</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 75000"
                  value={saleRevenue}
                  onChange={(e) => setSaleRevenue(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase">Sale Notes (Buyer/Weight Details)</label>
                <textarea
                  rows={3}
                  placeholder="e.g., Sold to Tuburan Public Market Buyer. Average weight 85kg per hog."
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-900 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSaleModal(false)}
                  className="flex-1 py-2.5 text-xs font-bold bg-slate-700 hover:bg-slate-650 text-slate-200 rounded-xl transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!saleDateError}
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl shadow-sm transition-all text-center ${
                    saleDateError
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                  }`}
                >
                  {selectedProduce.includes('Rental') || selectedProduce.includes('Lingkoranan') || selectedProduce.includes('Sako')
                    ? 'Record Rental Income'
                    : 'Record Sale / Income'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTENDANCE-WEIGHTED DIVIDEND ENGINE & DECEMBER PAYROLL MODAL */}
      <AttendanceDividendCalculatorModal
        isOpen={showDividendCalcModal}
        onClose={() => setShowDividendCalcModal(false)}
        members={members}
        meetings={meetings}
        hogRaisingState={state}
      />

    </div>
  );
}
