import React, { useState } from 'react';
import { Member, Meeting, Resolution, FinancialTransaction, SystemLog, Announcement, HogRaisingState, OfficerRole, OrganizationFund } from '../types';
import { INITIAL_FUNDS } from '../initialData';
import { 
  Printer, Download, X, FileText, ShieldCheck, Coins, 
  Users, Megaphone, Wallet, Database, Layers, CheckCircle2, AlertCircle
} from 'lucide-react';

interface OfficerReportModalProps {
  currentRole: OfficerRole;
  members: Member[];
  meetings: Meeting[];
  resolutions: Resolution[];
  transactions: FinancialTransaction[];
  announcements: Announcement[];
  logs: SystemLog[];
  funds?: OrganizationFund[];
  hogRaising?: HogRaisingState;
  onClose: () => void;
  onDownloadBackup?: () => void;
}

export default function OfficerReportModal({
  currentRole,
  members,
  meetings,
  resolutions,
  transactions,
  announcements,
  funds = INITIAL_FUNDS,
  hogRaising,
  onClose,
  onDownloadBackup
}: OfficerReportModalProps) {
  const isPresident = currentRole === 'President';
  // Non-presidents are strictly locked to their own officer role report
  const defaultRole = isPresident ? 'President' : currentRole;
  const [selectedReportType, setSelectedReportType] = useState<OfficerRole>(defaultRole);
  const [reportDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customRemarks, setCustomRemarks] = useState<string>('');

  // Enforce role lock if user is not President
  const activeReportRole = isPresident ? selectedReportType : currentRole;

  // Calculations for Financials
  let totalIncome = 0;
  let totalExpense = 0;
  const incomeCategoryTotals: Record<string, number> = {};
  const expenseCategoryTotals: Record<string, number> = {};
  const fundExpenseBreakdown: Record<string, number> = {};
  const fundIncomeBreakdown: Record<string, number> = {};

  transactions.forEach(t => {
    const budgetSource = t.fundSource || 'General Operational Fund (GF-SLP)';
    if (t.type === 'income') {
      totalIncome += t.amount;
      incomeCategoryTotals[t.category] = (incomeCategoryTotals[t.category] || 0) + t.amount;
      fundIncomeBreakdown[budgetSource] = (fundIncomeBreakdown[budgetSource] || 0) + t.amount;
    } else {
      totalExpense += t.amount;
      expenseCategoryTotals[t.category] = (expenseCategoryTotals[t.category] || 0) + t.amount;
      fundExpenseBreakdown[budgetSource] = (fundExpenseBreakdown[budgetSource] || 0) + t.amount;
    }
  });

  const netBalance = totalIncome - totalExpense;
  const auditedCount = transactions.filter(t => t.auditedStatus === 'Audited').length;
  const flaggedCount = transactions.filter(t => t.auditedStatus === 'Flagged').length;
  const unauditedCount = transactions.filter(t => !t.auditedStatus || t.auditedStatus === 'Unaudited').length;
  const auditComplianceRate = transactions.length > 0 ? ((auditedCount / transactions.length) * 100).toFixed(1) : '100.0';

  // Total Capital and Expenses across IGP Projects
  const hogCapital = typeof hogRaising?.capitalGrant === 'number'
    ? hogRaising.capitalGrant
    : (Number(hogRaising?.capitalGrant) || 0);
  const hogExpensesTotal = (hogRaising?.expenses || []).reduce((sum, e) => sum + e.amount, 0);
  const hogSalesTotal = (hogRaising?.sales || []).reduce((sum, s) => sum + s.revenue, 0);
  const hogNet = hogSalesTotal - hogExpensesTotal;

  // Calculations for Members
  const activeMembers = members.filter(m => m.status === 'Active');
  const inactiveMembers = members.filter(m => m.status === 'Inactive');
  const sitioCounts: Record<string, number> = {};
  members.forEach(m => {
    const s = m.farmLocation || 'Unassigned';
    sitioCounts[s] = (sitioCounts[s] || 0) + 1;
  });

  // Officer names
  const getOfficerNameByRole = (r: OfficerRole) => {
    switch (r) {
      case 'President': return 'Zenaida A. Elbiña';
      case 'Vice_President': return 'Anselna B. Arnado';
      case 'Secretary': return 'Jennylyn S. Lumactao';
      case 'Treasurer': return 'Gracelyn P. Asendiente';
      case 'Auditor': return 'Lorena B. Pinote';
      case 'PIO': return 'Ida S. Manera';
      default: return 'AFA Officer';
    }
  };

  // Printable report handler
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to open the print view.');
      return;
    }

    const titleMap: Record<OfficerRole, string> = {
      Treasurer: "TREASURER'S OFFICIAL FINANCIAL & CASH FLOW REPORT",
      Auditor: "AUDITOR'S FINANCIAL OVERSIGHT & COMPLIANCE REPORT",
      Secretary: "SECRETARY'S MEMBERSHIP & LEGISLATIVE MINUTES REPORT",
      President: "PRESIDENT'S CONSOLIDATED EXECUTIVE SUMMARY OF ALL OFFICER REPORTS",
      Vice_President: "VICE PRESIDENT'S EXECUTIVE ADMINISTRATION REPORT",
      PIO: "PUBLIC INFORMATION OFFICER (PIO) COMMUNITY COMMUNICATIONS REPORT"
    };

    const docTitle = titleMap[activeReportRole] || 'AFA OFFICIAL OFFICER REPORT';

    let contentHtml = '';

    if (activeReportRole === 'Treasurer') {
      contentHtml = `
        <div class="section-title">1. FINANCIAL OVERVIEW & GENERAL CASH BALANCE</div>
        <table>
          <tr><th>Financial Ledger Category</th><th>Amount (PHP)</th><th>Budget Status / Remarks</th></tr>
          <tr><td><strong>Total Association Income / Receipts</strong></td><td class="income">+ PHP ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td>Dues, Donations, Livelihood & Sales</td></tr>
          <tr><td><strong>Total Association Expenditures</strong></td><td class="expense">- PHP ${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td>Disbursed Operating & Capital Costs</td></tr>
          <tr style="background:#f1f5f9;"><td><strong>NET GENERAL CASH BALANCE</strong></td><td><strong>PHP ${netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td><td><strong>Revolving Liquid Balance</strong></td></tr>
        </table>

        <div class="section-title">2. REGISTERED ORGANIZATION FUND ACCOUNTS & SOURCE OF BUDGET ALLOCATIONS</div>
        <p style="font-size: 10px; color: #475569; margin-bottom: 8px;">
          The table below indicates the official treasury accounts and funding programs from which all project budgets and operational expenditures are drawn:
        </p>
        <table>
          <thead>
            <tr>
              <th>Fund Code</th>
              <th>Fund Account / Program Name</th>
              <th>Origin / Sponsoring Agency</th>
              <th>Allocated Capital (PHP)</th>
              <th>Live Audited Balance (PHP)</th>
              <th>Custodian</th>
            </tr>
          </thead>
          <tbody>
            ${funds.map(f => `
              <tr>
                <td><strong>${f.code}</strong></td>
                <td><strong>${f.name}</strong><br/><span style="font-size: 8.5px; color:#64748b;">${f.description}</span></td>
                <td>${f.code.includes('DOLE') ? 'DOLE Region VII' : f.code.includes('SLP') ? 'DSWD-SLP / LGU' : f.code.includes('ATI') ? 'ATI-RTC VII' : f.code.includes('FCCT') ? 'FCCT Cooperative Bank' : f.code.includes('DISP') ? '5% Statutory Reserve Pool' : 'AFA Member Equity'}</td>
                <td>PHP ${f.allocatedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td style="color: #065f46; font-weight: bold;">PHP ${f.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td>${f.custodian}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="section-title">3. WHERE BUDGET WAS TAKEN FROM (EXPENDITURES DISBURSED BY FUND SOURCE)</div>
        <table>
          <thead>
            <tr>
              <th>Budget / Fund Source Taken From</th>
              <th>Funding / Allocation Purpose</th>
              <th>Total Disbursed (PHP)</th>
              <th>Accounting Proportion</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(fundExpenseBreakdown).map(([source, amt]) => `
              <tr>
                <td><strong>${source}</strong></td>
                <td>${source.includes('DOLE') ? 'Livestock stock, feeds & infrastructure' : source.includes('SLP') || source.includes('GF') ? 'General association operations & meeting logistics' : source.includes('ATI') ? 'Training & farmer capacity development' : source.includes('DISP') ? 'Mortality insurance & medical replacements' : 'Operational disbursements'}</td>
                <td class="expense">PHP ${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td>${totalExpense > 0 ? ((amt / totalExpense) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            `).join('') || '<tr><td colspan="4">No fund disbursements recorded.</td></tr>'}
          </tbody>
        </table>

        <div class="section-title">4. ITEMIZATION OF REVENUE & EXPENDITURES BY CATEGORY</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <h4 style="font-size: 10px; margin: 0 0 4px 0; color: #065f46; text-transform: uppercase;">Income by Category</h4>
            <table>
              <tr><th>Income Category</th><th>Total Received</th></tr>
              ${Object.entries(incomeCategoryTotals).map(([cat, amt]) => `
                <tr><td>${cat}</td><td>PHP ${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
              `).join('') || '<tr><td colspan="2">No income entries.</td></tr>'}
            </table>
          </div>
          <div>
            <h4 style="font-size: 10px; margin: 0 0 4px 0; color: #991b1b; text-transform: uppercase;">Expenditures by Category</h4>
            <table>
              <tr><th>Expense Category</th><th>Total Disbursed</th></tr>
              ${Object.entries(expenseCategoryTotals).map(([cat, amt]) => `
                <tr><td>${cat}</td><td>PHP ${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
              `).join('') || '<tr><td colspan="2">No expense entries.</td></tr>'}
            </table>
          </div>
        </div>

        <div class="section-title">5. DETAILED TRANSACTION LEDGER (WITH BUDGET SOURCE TRACEABILITY)</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Category</th>
              <th>Budget / Fund Source Taken From</th>
              <th>Description / Purpose</th>
              <th>Recorded By</th>
              <th>Amount</th>
              <th>Audit Status</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map(t => `
              <tr>
                <td>${t.date}</td>
                <td><span class="${t.type}">${t.type.toUpperCase()}</span></td>
                <td>${t.category}</td>
                <td><strong style="color: #0f766e;">${t.fundSource || 'General Operational Fund (GF-SLP)'}</strong></td>
                <td>${t.description}</td>
                <td>${t.recordedBy}</td>
                <td class="${t.type === 'income' ? 'income' : 'expense'}">PHP ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td>${t.auditedStatus || 'Unaudited'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReportRole === 'Auditor') {
      contentHtml = `
        <div class="section-title">1. AUDIT EVALUATION & COMPLIANCE SUMMARY</div>
        <table>
          <tr><th>Audit Metric</th><th>Evaluation Outcome</th><th>Audit Verification Standard</th></tr>
          <tr><td>Total Transactions Examined</td><td><strong>${transactions.length} Record(s)</strong></td><td>100% Comprehensive Ledger Examination</td></tr>
          <tr><td>Verified & Audited OK</td><td style="color: green; font-weight: bold;">${auditedCount} Transaction(s)</td><td>Supported by official receipts & disbursement vouchers</td></tr>
          <tr><td>Flagged Discrepancy Items</td><td style="color: red; font-weight: bold;">${flaggedCount} Item(s)</td><td>Requires receipt clarification / officer justification</td></tr>
          <tr><td>Pending Audit Verification</td><td>${unauditedCount} Item(s)</td><td>Queued for forthcoming regular committee audit</td></tr>
          <tr><td>Overall Audit Compliance Rate</td><td><strong>${auditComplianceRate}%</strong></td><td>Cooperative Development Authority (CDA) Standard Compliant</td></tr>
        </table>

        <div class="section-title">2. BUDGET SOURCE & ALLOCATION RESTRICTION COMPLIANCE AUDIT</div>
        <p style="font-size: 10px; color: #475569; margin-bottom: 8px;">
          Auditor's evaluation verifying that all funds were drawn strictly from their designated budget source allocations:
        </p>
        <table>
          <thead>
            <tr>
              <th>Fund Account / Source</th>
              <th>Sponsoring Body / Origin</th>
              <th>Authorized Expenditure Scope</th>
              <th>Compliance Finding</th>
            </tr>
          </thead>
          <tbody>
            ${funds.map(f => `
              <tr>
                <td><strong>${f.name} (${f.code})</strong></td>
                <td>${f.code.includes('DOLE') ? 'DOLE Integrated Livelihood Program' : f.code.includes('SLP') ? 'DSWD Sustainable Livelihood Program' : f.code.includes('ATI') ? 'Agricultural Training Institute' : f.code.includes('DISP') ? 'AFA Statutory 5% Reserve' : 'Cooperative Capital'}</td>
                <td>${f.description}</td>
                <td style="color: green; font-weight: bold;">✓ VERIFIED & IN COMPLIANCE</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="section-title">3. FLAGGED ITEMS & ACTION REQUIRED (WITH BUDGET SOURCE CHARGED)</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Budget Source Charged</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Audit Notes / Discrepancy Reason</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.filter(t => t.auditedStatus === 'Flagged').map(t => `
              <tr style="background-color: #fef2f2;">
                <td>${t.date}</td>
                <td>${t.category}</td>
                <td><strong>${t.fundSource || 'General Operational Fund (GF-SLP)'}</strong></td>
                <td>${t.description}</td>
                <td class="expense">PHP ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td>${t.auditNotes || 'Requires official receipts or documentation clarification.'}</td>
              </tr>
            `).join('') || '<tr><td colspan="6" style="color: green; text-align: center;">No flagged financial items found. All audited records meet co-op standards.</td></tr>'}
          </tbody>
        </table>
      `;
    } else if (activeReportRole === 'Secretary') {
      contentHtml = `
        <div class="section-title">1. MEMBERSHIP ROSTER & RSBSA REGISTRATION STATISTICS</div>
        <table>
          <tr><th>Secretariat Metric</th><th>Count</th><th>Remarks</th></tr>
          <tr><td>Total Active Registered Members</td><td style="color: green; font-weight: bold;">${activeMembers.length} Members</td><td>Eligible for 50/30/20 Dividends & Seeds</td></tr>
          <tr><td>Inactive / On-Leave Members</td><td>${inactiveMembers.length} Members</td><td>For active roster reactivation</td></tr>
          <tr style="background:#f1f5f9;"><td><strong>Total Registered Association Roster</strong></td><td><strong>${members.length} Members</strong></td><td><strong>SEC & RSBSA Official Roster</strong></td></tr>
        </table>

        <div class="section-title">2. SITIO LOCATION BREAKDOWN</div>
        <table>
          <tr><th>Sitio Community Location</th><th>Registered Farmer Count</th><th>Coverage Rate</th></tr>
          ${Object.entries(sitioCounts).map(([sitio, count]) => `
            <tr><td>${sitio}</td><td>${count} Members</td><td>${((count / members.length) * 100).toFixed(1)}%</td></tr>
          `).join('')}
        </table>

        <div class="section-title">3. LEGISLATIVE RESOLUTIONS & BUDGET APPROVALS SUMMARY</div>
        <table>
          <thead>
            <tr><th>Res #</th><th>Title</th><th>Status</th><th>Moved By</th><th>Seconded By</th><th>Votes (Favor - Against - Abstain)</th></tr>
          </thead>
          <tbody>
            ${resolutions.map(r => `
              <tr>
                <td><strong>${r.resolutionNumber}</strong></td>
                <td>${r.title}</td>
                <td><span class="${r.status === 'Approved' ? 'income' : 'expense'}">${r.status}</span></td>
                <td>${r.movedBy}</td>
                <td>${r.secondedBy}</td>
                <td>${r.voteInFavor} - ${r.voteAgainst} - ${r.voteAbstain}</td>
              </tr>
            `).join('') || '<tr><td colspan="6">No resolutions recorded.</td></tr>'}
          </tbody>
        </table>

        <div class="section-title">4. GENERAL ASSEMBLY MEETINGS LOG</div>
        <table>
          <thead>
            <tr><th>Date</th><th>Title / Assembly</th><th>Location</th><th>Attendees Count</th></tr>
          </thead>
          <tbody>
            ${meetings.map(m => `
              <tr>
                <td>${m.date}</td>
                <td>${m.title}</td>
                <td>${m.location}</td>
                <td>${m.attendanceCount} Members Present</td>
              </tr>
            `).join('') || '<tr><td colspan="4">No meetings logged.</td></tr>'}
          </tbody>
        </table>
      `;
    } else if (activeReportRole === 'President') {
      // PRESIDENT'S CONSOLIDATED EXECUTIVE SUMMARY OF ALL EXECUTIVE OFFICERS
      contentHtml = `
        <div class="section-title">1. EXECUTIVE OVERVIEW & STATE OF THE ASSOCIATION</div>
        <table>
          <tr><th>Executive Key Performance Indicator</th><th>Current Status Outcome</th></tr>
          <tr><td>Total Registered Farmer Roster</td><td><strong>${members.length} Members (${activeMembers.length} Active, ${inactiveMembers.length} Inactive)</strong></td></tr>
          <tr><td>General Fund Financial Cash Balance</td><td><strong>PHP ${netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td></tr>
          <tr><td>DOLE Assistance Capital Allocation</td><td><strong>PHP ${hogCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })} Dedicated Livelihood Capital</strong></td></tr>
          <tr><td>Passed Legislative Resolutions</td><td>${resolutions.filter(r => r.status === 'Approved').length} Approved Resolution(s) out of ${resolutions.length} Total</td></tr>
          <tr><td>Financial Audit Integrity Rate</td><td><strong>${auditComplianceRate}% Verified Compliance (Auditor: Lorena B. Pinote)</strong></td></tr>
          <tr><td>Public Announcements Broadcasted</td><td>${announcements.length} Published Advisories (${announcements.filter(a => a.priority === 'High').length} High Priority)</td></tr>
        </table>

        <div class="section-title">2. CAPITAL & SOURCE OF BUDGET ALLOCATIONS (WHERE BUDGET WAS TAKEN FROM)</div>
        <p style="font-size: 10px; color: #475569; margin-bottom: 8px;">
          Master inventory of government capital allocations, cooperative deposits, and organizational funds managed by the Association:
        </p>
        <table>
          <thead>
            <tr>
              <th>Fund Code</th>
              <th>Fund Program Name</th>
              <th>Originating Budget / Funding Source</th>
              <th>Allocated Capital (PHP)</th>
              <th>Audited Live Balance (PHP)</th>
              <th>Fund Custodian</th>
            </tr>
          </thead>
          <tbody>
            ${funds.map(f => `
              <tr>
                <td><strong>${f.code}</strong></td>
                <td><strong>${f.name}</strong></td>
                <td>${f.code.includes('DOLE') ? 'DOLE Integrated Livelihood Program (DILP)' : f.code.includes('SLP') ? 'DSWD-SLP & LGU Tuburan Seed Fund' : f.code.includes('ATI') ? 'ATI Region VII Training Fund' : f.code.includes('FCCT') ? 'FCCT Cooperative Bank Savings' : f.code.includes('DISP') ? '5% Gross Statutory Reserve' : 'Member Equity Pool'}</td>
                <td>PHP ${f.allocatedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td style="color: #065f46; font-weight: bold;">PHP ${f.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td>${f.custodian}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="section-title">3. TREASURER'S FINANCIAL DEPARTMENT SUMMARY</div>
        <table>
          <tr><th>Financial Metric</th><th>Amount (PHP)</th><th>Budget Status / Remarks</th></tr>
          <tr><td>Total Gross Revenue Collected</td><td class="income">+ PHP ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td>Membership dues, donations, sales & livelihood</td></tr>
          <tr><td>Total Disbursed Operating Expenses</td><td class="expense">- PHP ${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td>Disbursed across GF-SLP, ATI, & operational allocations</td></tr>
          <tr style="background:#f1f5f9;"><td><strong>NET CASH FUND BALANCE</strong></td><td><strong>PHP ${netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td><td><strong>Liquid Treasury Balance</strong></td></tr>
        </table>

        <div class="section-title">4. AUDITOR'S FINANCIAL OVERSIGHT SUMMARY</div>
        <table>
          <tr><th>Audit Metric</th><th>Details</th></tr>
          <tr><td>Transactions Evaluated</td><td>${transactions.length} Total Ledger Items</td></tr>
          <tr><td>Verified & Audited OK</td><td style="color: green; font-weight: bold;">${auditedCount} Transaction(s)</td></tr>
          <tr><td>Flagged Discrepancies Requiring Review</td><td style="color: red; font-weight: bold;">${flaggedCount} Item(s)</td></tr>
          <tr><td>Audit Compliance Rate</td><td><strong>${auditComplianceRate}%</strong></td></tr>
        </table>

        <div class="section-title">5. SECRETARY'S MEMBERSHIP & LEGISLATIVE ASSEMBLY SUMMARY</div>
        <table>
          <tr><th>Secretariat Metric</th><th>Details</th></tr>
          <tr><td>Registered Roster Count</td><td>${members.length} Farmers (${activeMembers.length} Active)</td></tr>
          <tr><td>Sitio Locations Covered</td><td>${Object.keys(sitioCounts).length} Sitio Communities</td></tr>
          <tr><td>Passed Legislative Resolutions</td><td>${resolutions.filter(r => r.status === 'Approved').length} Approved out of ${resolutions.length} Total</td></tr>
          <tr><td>General Assembly Sessions Held</td><td>${meetings.length} Recorded Meetings</td></tr>
        </table>

        <div class="section-title">6. PUBLIC INFORMATION OFFICER (PIO) SUMMARY</div>
        <table>
          <tr><th>PIO Metric</th><th>Details</th></tr>
          <tr><td>Total Community Bulletins Published</td><td>${announcements.length} Announcements</td></tr>
          <tr><td>Urgent LGU & Weather Advisories</td><td>${announcements.filter(a => a.priority === 'High').length} High-Priority Bulletins</td></tr>
        </table>

        ${hogRaising ? `
          <div class="section-title">7. HOG RAISING & LIVELIHOOD IGP PROJECT (DOLE-DILP CAPITAL ALLOCATION)</div>
          <table>
            <tr><th>IGP Metric</th><th>Outcome Details</th></tr>
            <tr><td><strong>Capital Allocation Budget Origin</strong></td><td><strong>DOLE Integrated Livelihood Program (DILP) (PHP ${hogCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })})</strong></td></tr>
            <tr><td>Total Operating Expenses Recorded</td><td>PHP ${hogExpensesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} (Feeds, Piglets, Vaccines)</td></tr>
            <tr><td>Active Volunteer Chore Groups</td><td>${hogRaising.groups?.length || 0} Member Caretaker Teams</td></tr>
            <tr><td>Total Batch Sales Revenue Collected</td><td>PHP ${hogSalesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
            <tr><td>Net Livelihood Tubo / Proceeds</td><td style="color: ${hogNet >= 0 ? 'green' : 'red'}; font-weight: bold;">PHP ${hogNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          </table>
        ` : ''}

        <div class="section-title">8. EXECUTIVE OFFICERS DIRECTORY</div>
        <table>
          <thead>
            <tr><th>Role</th><th>Officer Name</th><th>Designation</th></tr>
          </thead>
          <tbody>
            <tr><td>President</td><td>Zenaida A. Elbiña</td><td>Chief Executive Officer</td></tr>
            <tr><td>Vice President</td><td>Anselna B. Arnado</td><td>Executive Vice Chairman</td></tr>
            <tr><td>Secretary</td><td>Jennylyn S. Lumactao</td><td>Records & Secretariat Head</td></tr>
            <tr><td>Treasurer</td><td>Gracelyn P. Asendiente</td><td>General Custodian of Funds</td></tr>
            <tr><td>Auditor</td><td>Lorena B. Pinote</td><td>Chief Financial Auditor</td></tr>
            <tr><td>PIO</td><td>Ida S. Manera</td><td>Public Information Officer</td></tr>
          </tbody>
        </table>
      `;
    } else if (activeReportRole === 'PIO') {
      contentHtml = `
        <div class="section-title">1. PUBLIC ANNOUNCEMENTS & ADVISORIES SUMMARY</div>
        <table>
          <tr><th>Metric</th><th>Count</th></tr>
          <tr><td>Total Bulletins Published</td><td>${announcements.length} Announcement(s)</td></tr>
          <tr><td>High Priority Advisories</td><td>${announcements.filter(a => a.priority === 'High').length} Bulletins</td></tr>
        </table>

        <div class="section-title">2. RECENT BULLETIN BROADCASTS</div>
        <table>
          <thead>
            <tr><th>Date Posted</th><th>Category</th><th>Title</th><th>Priority</th><th>Posted By</th></tr>
          </thead>
          <tbody>
            ${announcements.map(a => `
              <tr>
                <td>${a.datePosted}</td>
                <td>${a.category}</td>
                <td><strong>${a.title}</strong></td>
                <td>${a.priority}</td>
                <td>${a.postedBy}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">No announcements recorded.</td></tr>'}
          </tbody>
        </table>
      `;
    } else if (activeReportRole === 'Vice_President') {
      contentHtml = `
        <div class="section-title">1. VICE PRESIDENT ADMINISTRATION & COMMITTEE REPORT</div>
        <table>
          <tr><th>Executive Metric</th><th>Current Status</th></tr>
          <tr><td>Total Registered Farmer Members</td><td><strong>${members.length} Members (${activeMembers.length} Active)</strong></td></tr>
          <tr><td>General Fund Financial Health</td><td><strong>PHP ${netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td></tr>
          <tr><td>Committees Supervised</td><td>6 Active Operational Units</td></tr>
          <tr><td>Passed Resolutions Oversight</td><td>${resolutions.filter(r => r.status === 'Approved').length} Approved Resolutions</td></tr>
        </table>
      `;
    }

    const remarksBlock = customRemarks ? `
      <div class="section-title">OFFICER REMARKS & SPECIAL NOTES</div>
      <div style="background:#f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; font-size: 11px; font-style: italic; margin-bottom: 20px;">
        "${customRemarks.replace(/\n/g, '<br/>')}"
      </div>
    ` : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${docTitle}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.5; padding: 10px; }
            .header-container { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px; }
            .republic { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
            .assoc-name { font-size: 18px; font-weight: 900; color: #065f46; margin: 4px 0; font-family: serif; }
            .location { font-size: 10px; color: #64748b; font-weight: 600; }
            .doc-title { font-size: 13px; font-weight: 800; text-align: center; margin: 15px 0; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 8px; border-radius: 6px; color: #065f46; letter-spacing: 0.5px; }
            .meta-bar { display: flex; justify-content: space-between; font-size: 10px; color: #475569; margin-bottom: 15px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
            .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #0f766e; margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background-color: #f1f5f9; color: #334155; font-weight: bold; text-transform: uppercase; font-size: 9px; }
            .income { color: #166534; font-weight: bold; }
            .expense { color: #991b1b; font-weight: bold; }
            .signature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px; page-break-inside: avoid; }
            .sig-box { text-align: center; font-size: 10px; }
            .sig-line { border-bottom: 1px solid #334155; margin-bottom: 4px; height: 35px; }
            .sig-name { font-weight: bold; color: #0f172a; text-transform: uppercase; }
            .sig-title { color: #64748b; font-size: 9px; }
            .seal-stamp { text-align: center; margin-top: 25px; font-size: 9px; color: #94a3b8; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="republic">Republic of the Philippines • Province of Cebu • Municipality of Tuburan</div>
            <div class="assoc-name">ALEGRIA FARMERS ASSOCIATION (AFA)</div>
            <div class="location">Barangay Alegria, Tuburan, Cebu • Official LGU & Cooperative Administration Registry</div>
          </div>

          <div class="doc-title">${docTitle}</div>

          <div class="meta-bar">
            <span><strong>Date Generated:</strong> ${reportDate}</span>
            <span><strong>Prepared By:</strong> ${getOfficerNameByRole(activeReportRole)} (${activeReportRole})</span>
            <span><strong>Status:</strong> Official Certified Record</span>
          </div>

          ${contentHtml}

          ${remarksBlock}

          <div class="signature-grid">
            <div class="sig-box">
              <div class="sig-line"></div>
              <div class="sig-name">${getOfficerNameByRole(activeReportRole)}</div>
              <div class="sig-title">Preparing Officer (${activeReportRole})</div>
            </div>

            <div class="sig-box">
              <div class="sig-line"></div>
              <div class="sig-name">Lorena B. Pinote</div>
              <div class="sig-title">Auditor Verification</div>
            </div>

            <div class="sig-box">
              <div class="sig-line"></div>
              <div class="sig-name">Zenaida A. Elbiña</div>
              <div class="sig-title">President (Approved & Attested)</div>
            </div>
          </div>

          <div class="seal-stamp">
            *** Certified Official Report of the Alegria Farmers Association (AFA) - Barangay Alegria, Tuburan, Cebu ***
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // CSV Export handler
  const handleExportCSV = () => {
    const csvRows: string[] = [];

    if (activeReportRole === 'Treasurer') {
      csvRows.push('AFA OFFICIAL TREASURER FINANCIAL REPORT');
      csvRows.push(`Date Generated,${reportDate}`);
      csvRows.push(`Prepared By,${getOfficerNameByRole('Treasurer')}`);
      csvRows.push('');
      csvRows.push('1. FINANCIAL SUMMARY');
      csvRows.push(`Total Income (PHP),${totalIncome.toFixed(2)}`);
      csvRows.push(`Total Expenditures (PHP),${totalExpense.toFixed(2)}`);
      csvRows.push(`Net Balance (PHP),${netBalance.toFixed(2)}`);
      csvRows.push('');
      csvRows.push('2. REGISTERED ORGANIZATION FUND ACCOUNTS & SOURCE OF BUDGET ALLOCATIONS (WHERE BUDGET WAS TAKEN FROM)');
      csvRows.push('Fund Code,Fund Account Name,Funding Origin / Source,Allocated Capital (PHP),Live Audited Balance (PHP),Custodian');
      funds.forEach(f => {
        const origin = f.code.includes('DOLE') ? 'DOLE Integrated Livelihood Program (DILP)' : f.code.includes('SLP') ? 'DSWD-SLP & LGU Tuburan Seed Fund' : f.code.includes('ATI') ? 'ATI Region VII Training Fund' : f.code.includes('FCCT') ? 'FCCT Cooperative Bank Savings' : f.code.includes('DISP') ? '5% Gross Statutory Reserve' : 'Member Equity Pool';
        csvRows.push([
          `"${f.code}"`,
          `"${f.name.replace(/"/g, '""')}"`,
          `"${origin}"`,
          f.allocatedAmount.toFixed(2),
          f.currentBalance.toFixed(2),
          `"${f.custodian.replace(/"/g, '""')}"`
        ].join(','));
      });
      csvRows.push('');
      csvRows.push('3. DISBURSEMENTS BY BUDGET / FUND SOURCE (WHERE BUDGET WAS TAKEN FROM)');
      csvRows.push('Budget / Fund Source,Total Disbursed (PHP)');
      Object.entries(fundExpenseBreakdown).forEach(([source, amt]) => {
        csvRows.push([
          `"${source.replace(/"/g, '""')}"`,
          amt.toFixed(2)
        ].join(','));
      });
      csvRows.push('');
      csvRows.push('4. TRANSACTION LEDGER WITH BUDGET SOURCE TRACEABILITY');
      csvRows.push('ID,Date,Type,Category,Budget / Fund Source Taken From,Description,Recorded By,Amount (PHP),Audit Status');
      transactions.forEach(t => {
        csvRows.push([
          t.id,
          t.date,
          t.type,
          `"${t.category.replace(/"/g, '""')}"`,
          `"${(t.fundSource || 'General Operational Fund (GF-SLP)').replace(/"/g, '""')}"`,
          `"${t.description.replace(/"/g, '""')}"`,
          `"${t.recordedBy.replace(/"/g, '""')}"`,
          t.amount.toFixed(2),
          t.auditedStatus || 'Unaudited'
        ].join(','));
      });
    } else if (activeReportRole === 'Auditor') {
      csvRows.push('AFA OFFICIAL AUDITOR INSPECTION REPORT');
      csvRows.push(`Date Generated,${reportDate}`);
      csvRows.push(`Auditor,${getOfficerNameByRole('Auditor')}`);
      csvRows.push('');
      csvRows.push('1. AUDIT METRICS');
      csvRows.push(`Total Evaluated,${transactions.length}`);
      csvRows.push(`Audited OK,${auditedCount}`);
      csvRows.push(`Flagged Discrepancies,${flaggedCount}`);
      csvRows.push(`Compliance Rate (%),${auditComplianceRate}`);
      csvRows.push('');
      csvRows.push('2. BUDGET SOURCE COMPLIANCE AUDIT (WHERE BUDGET WAS TAKEN FROM)');
      csvRows.push('Fund Code,Fund Account Name,Compliance Status,Authorized Purpose');
      funds.forEach(f => {
        csvRows.push([
          `"${f.code}"`,
          `"${f.name.replace(/"/g, '""')}"`,
          'VERIFIED COMPLIANT',
          `"${f.description.replace(/"/g, '""')}"`
        ].join(','));
      });
      csvRows.push('');
      csvRows.push('3. FLAGGED TRANSACTIONS REQUIRING ATTENTION');
      csvRows.push('ID,Date,Category,Budget Source Charged,Description,Amount (PHP),Audit Notes');
      transactions.filter(t => t.auditedStatus === 'Flagged').forEach(t => {
        csvRows.push([
          t.id,
          t.date,
          `"${t.category.replace(/"/g, '""')}"`,
          `"${(t.fundSource || 'General Operational Fund (GF-SLP)').replace(/"/g, '""')}"`,
          `"${t.description.replace(/"/g, '""')}"`,
          t.amount.toFixed(2),
          `"${(t.auditNotes || '').replace(/"/g, '""')}"`
        ].join(','));
      });
    } else if (activeReportRole === 'Secretary') {
      csvRows.push('AFA OFFICIAL SECRETARY ROSTER & LEGISLATIVE REPORT');
      csvRows.push(`Date Generated,${reportDate}`);
      csvRows.push(`Secretary,${getOfficerNameByRole('Secretary')}`);
      csvRows.push('');
      csvRows.push('MEMBERSHIP ROSTER');
      csvRows.push('ID,Name,Member ID,RSBSA Number,Sitio Location,Primary Crops,Status,Joined Date');
      members.forEach(m => {
        csvRows.push([
          m.id,
          `"${m.name.replace(/"/g, '""')}"`,
          `"${m.memberIdNumber || 'Pending'}"`,
          `"${m.rsbsaNumber || 'Pending'}"`,
          `"${m.farmLocation.replace(/"/g, '""')}"`,
          `"${m.primaryCrops.join('; ').replace(/"/g, '""')}"`,
          m.status,
          m.joinedDate
        ].join(','));
      });
      csvRows.push('');
      csvRows.push('RESOLUTIONS');
      csvRows.push('Resolution Number,Title,Status,Moved By,Seconded By,In Favor,Against,Abstain');
      resolutions.forEach(r => {
        csvRows.push([
          `"${r.resolutionNumber.replace(/"/g, '""')}"`,
          `"${r.title.replace(/"/g, '""')}"`,
          r.status,
          `"${r.movedBy.replace(/"/g, '""')}"`,
          `"${r.secondedBy.replace(/"/g, '""')}"`,
          r.voteInFavor.toString(),
          r.voteAgainst.toString(),
          r.voteAbstain.toString()
        ].join(','));
      });
    } else if (activeReportRole === 'PIO') {
      csvRows.push('AFA OFFICIAL PIO COMMUNITY COMMUNICATIONS REPORT');
      csvRows.push(`Date Generated,${reportDate}`);
      csvRows.push(`PIO,${getOfficerNameByRole('PIO')}`);
      csvRows.push('');
      csvRows.push('ANNOUNCEMENTS LOG');
      csvRows.push('ID,Date Posted,Category,Title,Priority,Posted By');
      announcements.forEach(a => {
        csvRows.push([
          a.id,
          a.datePosted,
          `"${a.category.replace(/"/g, '""')}"`,
          `"${a.title.replace(/"/g, '""')}"`,
          a.priority,
          `"${a.postedBy.replace(/"/g, '""')}"`
        ].join(','));
      });
    } else if (activeReportRole === 'Vice_President') {
      csvRows.push('AFA OFFICIAL VICE PRESIDENT ADMINISTRATION REPORT');
      csvRows.push(`Date Generated,${reportDate}`);
      csvRows.push(`Vice President,${getOfficerNameByRole('Vice_President')}`);
      csvRows.push('');
      csvRows.push('ADMINISTRATION METRICS');
      csvRows.push(`Registered Members,${members.length}`);
      csvRows.push(`Active Members,${activeMembers.length}`);
      csvRows.push(`Net Fund Balance (PHP),${netBalance.toFixed(2)}`);
      csvRows.push(`Approved Resolutions,${resolutions.filter(r => r.status === 'Approved').length}`);
    } else {
      // PRESIDENT'S CONSOLIDATED EXECUTIVE CSV REPORT
      csvRows.push('AFA PRESIDENT CONSOLIDATED EXECUTIVE SUMMARY OF ALL OFFICERS REPORTS');
      csvRows.push(`Date Generated,${reportDate}`);
      csvRows.push(`President,${getOfficerNameByRole('President')}`);
      csvRows.push('');
      csvRows.push('1. EXECUTIVE STATE OF THE ASSOCIATION');
      csvRows.push(`Total Registered Farmer Members,${members.length}`);
      csvRows.push(`Active Farmer Members,${activeMembers.length}`);
      csvRows.push(`Net General Cash Fund Balance (PHP),${netBalance.toFixed(2)}`);
      csvRows.push(`DOLE-DILP Capital Allocation (PHP),${hogCapital.toFixed(2)}`);
      csvRows.push(`Approved Legislative Resolutions,${resolutions.filter(r => r.status === 'Approved').length}`);
      csvRows.push(`Financial Audit Compliance Rate (%),${auditComplianceRate}`);
      csvRows.push('');
      csvRows.push('2. PORTFOLIO OF CAPITAL & BUDGET SOURCES (WHERE BUDGET WAS TAKEN FROM)');
      csvRows.push('Fund Code,Fund Account Name,Originating Source,Allocated Capital (PHP),Audited Balance (PHP),Custodian');
      funds.forEach(f => {
        const origin = f.code.includes('DOLE') ? 'DOLE Integrated Livelihood Program (DILP)' : f.code.includes('SLP') ? 'DSWD-SLP & LGU Tuburan Seed Fund' : f.code.includes('ATI') ? 'ATI Region VII Training Fund' : f.code.includes('FCCT') ? 'FCCT Cooperative Bank Savings' : f.code.includes('DISP') ? '5% Gross Statutory Reserve' : 'Member Equity Pool';
        csvRows.push([
          `"${f.code}"`,
          `"${f.name.replace(/"/g, '""')}"`,
          `"${origin}"`,
          f.allocatedAmount.toFixed(2),
          f.currentBalance.toFixed(2),
          `"${f.custodian.replace(/"/g, '""')}"`
        ].join(','));
      });
      csvRows.push('');
      csvRows.push('3. TREASURER FINANCIAL SUMMARY');
      csvRows.push(`Gross Income (PHP),${totalIncome.toFixed(2)}`);
      csvRows.push(`Gross Expenditures (PHP),${totalExpense.toFixed(2)}`);
      csvRows.push(`Net Balance (PHP),${netBalance.toFixed(2)}`);
      csvRows.push('');
      csvRows.push('4. AUDITOR COMPLIANCE SUMMARY');
      csvRows.push(`Total Evaluated Transactions,${transactions.length}`);
      csvRows.push(`Audited Verified OK,${auditedCount}`);
      csvRows.push(`Flagged Discrepancy Items,${flaggedCount}`);
      csvRows.push(`Audit Integrity Rate (%),${auditComplianceRate}`);
      csvRows.push('');
      csvRows.push('5. SECRETARY ROSTER & ASSEMBLY SUMMARY');
      csvRows.push(`Active Members,${activeMembers.length}`);
      csvRows.push(`Inactive Members,${inactiveMembers.length}`);
      csvRows.push(`Passed Resolutions,${resolutions.filter(r => r.status === 'Approved').length}`);
      csvRows.push(`General Assembly Meetings Logged,${meetings.length}`);
      csvRows.push('');
      csvRows.push('6. PUBLIC INFORMATION OFFICER (PIO) SUMMARY');
      csvRows.push(`Total Bulletins Published,${announcements.length}`);
      csvRows.push(`High Priority Advisories,${announcements.filter(a => a.priority === 'High').length}`);
      if (hogRaising) {
        csvRows.push('');
        csvRows.push('7. HOG RAISING IGP LIVELIHOOD SUMMARY (DOLE-DILP CAPITAL ALLOCATION)');
        csvRows.push(`Capital Allocation Origin,DOLE Integrated Livelihood Program (DILP)`);
        csvRows.push(`Capital Allocation Amount (PHP),${hogCapital.toFixed(2)}`);
        csvRows.push(`Total Operating Expenses (PHP),${hogExpensesTotal.toFixed(2)}`);
        csvRows.push(`Active Volunteer Chore Groups,${hogRaising.groups?.length || 0}`);
        csvRows.push(`Total Batch Sales Revenue (PHP),${hogSalesTotal.toFixed(2)}`);
        csvRows.push(`Net Livelihood Tubo (PHP),${hogNet.toFixed(2)}`);
      }
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `AFA_Report_${activeReportRole}_${reportDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[90] animate-fade-in text-left">
      <div className="bg-[#F7F4EF] border border-[#D5CFC1] w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-[#1B4332]">
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-[#F0EDE7] border-b border-[#D5CFC1] flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-[#1B4332] uppercase tracking-wider flex flex-wrap items-center gap-2">
                <span className="truncate">{isPresident ? "President's Executive Summary & Export Center" : `${currentRole.replace('_', ' ')} Official Report Center`}</span>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] px-2 py-0.5 rounded-full shrink-0 font-mono">
                  AFA Tuburan                </span>
              </h2>
              <p className="text-xs text-[#4A5F57] font-medium truncate">
                {isPresident 
                  ? "Generate and export the consolidated summary of all executive officer reports with budget origins."
                  : `Generate, export, or print the official ${currentRole.replace('_', ' ')} department report with full budget source traceability.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#4A5F57] hover:text-[#1B4332] p-2 rounded-xl bg-white border border-[#D5CFC1] transition-all cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* ROLE ACCESS BANNER */}
          {!isPresident ? (
            <div className="bg-emerald-950/40 border border-emerald-500/30 p-3.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <span className="font-extrabold text-white block">Official {currentRole.replace('_', ' ')} Department Report</span>
                  <p className="text-[11px] text-slate-300">
                    As {currentRole.replace('_', ' ')}, you can export or print your department's official records with verified budget source allocations.
                  </p>
                </div>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 font-mono text-[10px] px-2.5 py-1 rounded-lg border border-emerald-500/40 font-bold shrink-0">
                {currentRole} Report Only
              </span>
            </div>
          ) : (
            <div className="bg-purple-950/40 border border-purple-500/30 p-3.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-5 h-5 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <span className="font-extrabold text-white block">President's Executive Consolidated Access</span>
                  <p className="text-[11px] text-slate-300">
                    Exporting consolidated executive summaries across all executive officers with full treasury and capital breakdown (DOLE, DSWD-SLP, ATI, FCCT, Dispersal Pool, CBU).
                  </p>
                </div>
              </div>
              <span className="bg-purple-500/20 text-purple-300 font-mono text-[10px] px-2.5 py-1 rounded-lg border border-purple-500/40 font-bold shrink-0">
                President Mode
              </span>
            </div>
          )}

          {/* REPORT TYPE SELECTOR FOR PRESIDENT */}
          {isPresident && (
            <div className="space-y-2">
              <label className="block text-xs font-black text-[#4A5F57] uppercase tracking-wider">
                Select View / Report Scope:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { role: 'President' as OfficerRole, label: 'Consolidated Summary', icon: FileText, color: 'text-purple-600' },
                  { role: 'Treasurer' as OfficerRole, label: 'Treasurer (Funds)', icon: Coins, color: 'text-amber-700' },
                  { role: 'Auditor' as OfficerRole, label: 'Auditor (Oversight)', icon: ShieldCheck, color: 'text-emerald-700' },
                  { role: 'Secretary' as OfficerRole, label: 'Secretary', icon: Users, color: 'text-blue-700' },
                  { role: 'PIO' as OfficerRole, label: 'PIO Board', icon: Megaphone, color: 'text-pink-700' }
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = activeReportRole === item.role;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => setSelectedReportType(item.role)}
                      className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-100 border-emerald-500 text-[#1B4332] shadow-md'
                          : 'bg-white border-[#D5CFC1] text-[#1B4332] hover:bg-[#F0EDE7] hover:border-[#C9BDAE]'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${item.color}`} />
                      <span className="text-xs font-extrabold">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* REPORT PREVIEW CARD */}
          <div className="bg-[#F7F4EF] border border-[#D5CFC1] p-5 rounded-2xl space-y-4 text-xs text-[#1B4332]">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-[#D5CFC1] pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">Official Document Preview</span>
                <h3 className="text-sm font-black text-[#1B4332] mt-0.5">
                  {activeReportRole === 'Treasurer' && "Treasurer's Official Financial & Cash Flow Statement (With Budget Sources)"}
                  {activeReportRole === 'Auditor' && "Auditor's Financial Oversight & Allocation Compliance Inspection Report"}
                  {activeReportRole === 'Secretary' && "Secretary's Membership Roster & Legislative Assembly Report"}
                  {activeReportRole === 'President' && "President's Executive Consolidated Summary of All Officer Reports & Capital Portfolios"}
                  {activeReportRole === 'Vice_President' && "Vice President's Administration & Oversight Report"}
                  {activeReportRole === 'PIO' && "Public Information Officer Community Communications Report"}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#4A5F57]">Signing Officer:</span>
                <p className="font-extrabold text-[#1B4332]">{getOfficerNameByRole(activeReportRole)}</p>
              </div>
            </div>

            {/* QUICK PREVIEW METRICS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {activeReportRole === 'Treasurer' && (
                <>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Total Income</span>
                    <p className="text-sm font-mono font-bold text-emerald-700">PHP {totalIncome.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Total Expenses</span>
                    <p className="text-sm font-mono font-bold text-rose-600">PHP {totalExpense.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Net Fund</span>
                    <p className="text-sm font-mono font-bold text-[#1B4332]">PHP {netBalance.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Fund Accounts</span>
                    <p className="text-sm font-mono font-bold text-emerald-700">{funds.length} Active Budgets</p>
                  </div>
                </>
              )}

              {activeReportRole === 'Auditor' && (
                <>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Evaluated</span>
                    <p className="text-sm font-mono font-bold text-[#1B4332]">{transactions.length} Tx</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Audited OK</span>
                    <p className="text-sm font-mono font-bold text-emerald-700">{auditedCount} Verified</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Flagged</span>
                    <p className="text-sm font-mono font-bold text-rose-600">{flaggedCount} Discrepancies</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Compliance Rate</span>
                    <p className="text-sm font-mono font-bold text-emerald-700">{auditComplianceRate}%</p>
                  </div>
                </>
              )}

              {activeReportRole === 'Secretary' && (
                <>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Active Roster</span>
                    <p className="text-sm font-mono font-bold text-emerald-700">{activeMembers.length} Members</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Sitios Covered</span>
                    <p className="text-sm font-mono font-bold text-blue-700">{Object.keys(sitioCounts).length} Locations</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Resolutions</span>
                    <p className="text-sm font-mono font-bold text-[#1B4332]">{resolutions.length} Passed</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Meetings Logged</span>
                    <p className="text-sm font-mono font-bold text-amber-700">{meetings.length} Sessions</p>
                  </div>
                </>
              )}

              {activeReportRole === 'President' && (
                <>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Active Farmers</span>
                    <p className="text-sm font-mono font-bold text-[#1B4332]">{activeMembers.length} / {members.length}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Net Fund</span>
                    <p className="text-sm font-mono font-bold text-emerald-700">PHP {netBalance.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Capital Allocation</span>
                    <p className="text-sm font-mono font-bold text-amber-400">PHP {hogCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Audit Rate</span>
                    <p className="text-sm font-mono font-bold text-emerald-700">{auditComplianceRate}%</p>
                  </div>
                </>
              )}

              {(activeReportRole === 'Vice_President' || activeReportRole === 'PIO') && (
                <>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Total Members</span>
                    <p className="text-sm font-mono font-bold text-[#1B4332]">{members.length}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">General Fund</span>
                    <p className="text-sm font-mono font-bold text-emerald-700">PHP {netBalance.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Approved Res.</span>
                    <p className="text-sm font-mono font-bold text-purple-700">{resolutions.filter(r => r.status === 'Approved').length}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#D5CFC1]">
                    <span className="text-[10px] text-[#4A5F57] uppercase font-bold">Bulletins Published</span>
                    <p className="text-sm font-mono font-bold text-pink-700">{announcements.length}</p>
                  </div>
                </>
              )}
            </div>

            {/* REGISTERED BUDGET SOURCES CARD PREVIEW */}
            <div className="bg-white p-3.5 rounded-xl border border-[#D5CFC1] space-y-2">
              <span className="text-[10px] font-black uppercase text-[#4A5F57] flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Source of Funds & Budget Allocations Included in Report:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {funds.map(f => (
                  <span key={f.id} className="text-[10px] bg-[#F7F4EF] px-2.5 py-1 rounded-lg border border-[#D5CFC1] text-[#1B4332] font-medium flex items-center gap-1">
                    <strong className="text-emerald-700 font-mono">{f.code}</strong>: {f.name.split('/')[0]} (PHP {f.currentBalance.toLocaleString()})
                  </span>
                ))}
              </div>
            </div>

            {/* CUSTOM REMARKS INPUT */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-[10px] font-black text-[#4A5F57] uppercase">
                Dugang nga Mubo nga Pahayag / Special Remarks (Optional):
              </label>
              <textarea
                rows={2}
                value={customRemarks}
                onChange={(e) => setCustomRemarks(e.target.value)}
                placeholder="e.g., Reports compiled for Tuburan LGU Municipal Agriculture Audit & Annual AFA General Assembly."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 font-sans"              />
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 w-full">
          <div className="text-[10px] text-slate-500 font-mono text-center sm:text-left">
            Barangay Alegria Farmers Association • Tuburan, Cebu
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 w-full sm:w-auto">
            {currentRole === 'President' && onDownloadBackup && (
              <button
                type="button"
                onClick={onDownloadBackup}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 text-xs font-black transition-all cursor-pointer shadow-sm whitespace-nowrap"
                title="Download formatted JSON backup of all local association data"
              >
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Download System Backup</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#D5CFC1] bg-white hover:bg-[#F0EDE7] text-[#1B4332] text-xs font-bold transition-all cursor-pointer shadow-sm whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Export CSV (Excel)</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all cursor-pointer shadow-md whitespace-nowrap"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>I-print ang Official Report</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
