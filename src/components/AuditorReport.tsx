import "./president-report.css";
import { useEffect, useRef } from "react";

import type {
  User,
  FinancialTransaction,
  OrganizationFund,
  InventoryItem,
  LivestockIgpState,
  EggHarvestLog,
} from "../types";
import { resolveOfficerName } from "../utils/officers";
import {
  getAvailableInventoryQuantity,
  getInventoryDamagedQuantity,
} from "../utils/inventory";
import { deriveIgpLivestockInventory } from "../utils/igpInventory";

/* ---------- Data shape (Segregation of Duties) ----------
   The Auditor's Official Report covers financial verification & compliance
   audit, fund-source adherence, flagged discrepancies & unaudited backlog,
   IGP harvest & livestock headcount verification, and custodial property
   inventory. Itemized cash statements & balances belong exclusively to the
   Treasurer's Financial Statement. */

export type AuditOpinionCode =
  | "unqualified"
  | "qualified"
  | "pending"
  | "no_activity";

export interface FundComplianceRow {
  code: string;
  name: string;
  description: string;
  auditedCount: number;
  unauditedCount: number;
  flaggedCount: number;
  status: "Verified & Compliant" | "Exception — Flagged Items" | "Pending Review" | "No Recorded Activity";
}

export interface FlaggedTransactionRow {
  id: string;
  date: string;
  category: string;
  fundSource: string;
  description: string;
  amount: number;
  auditNotes: string;
  auditedBy: string;
  auditedDate: string;
}

export interface UnauditedTransactionRow {
  id: string;
  date: string;
  type: "income" | "expense";
  category: string;
  fundSource: string;
  description: string;
  amount: number;
  recordedBy: string;
}

export interface LivestockAuditRow {
  produce: string;
  stage: string;
  headCount: number;
}

export interface InventoryAuditRow {
  id: string;
  name: string;
  category: string;
  quantity: number;
  damagedQuantity: number;
  availableQuantity: number;
  unit: string;
  condition: string;
  location: string;
  notes: string;
  recordedBy: string;
  lastUpdated: string;
}

export interface AuditorReportData {
  year: number;
  generatedDate: string;
  org: {
    name: string;
    abbr: string;
    doleRegNo: string;
    province: string;
    municipality: string;
    barangay: string;
    logoSrc?: string;
  };
  opinion: {
    code: AuditOpinionCode;
    label: string;
    summary: string;
  };
  coverage: {
    totalTransactions: number;
    auditedCount: number;
    flaggedCount: number;
    unauditedCount: number;
    coverageRate: string;
    auditedVolume: number;
    flaggedVolume: number;
    unauditedVolume: number;
    presidentApprovedCount: number;
    presidentPendingCount: number;
    presidentReturnedCount: number;
  };
  fundCompliance: FundComplianceRow[];
  flaggedTransactions: FlaggedTransactionRow[];
  unauditedTransactions: UnauditedTransactionRow[];
  harvestAudit: {
    hasHarvestRecords: boolean;
    totalBatches: number;
    pendingAuditCount: number;
    auditedCount: number;
    signedCount: number;
    returnedCount: number;
    verifiedEggTotal: number;
    returnedHarvests: EggHarvestLog[];
  };
  livestockSnapshot: LivestockAuditRow[];
  totalLivestockHeads: number;
  inventorySummary: {
    totalItems: number;
    goodCount: number;
    needsRepairCount: number;
    damagedLostCount: number;
    totalUnits: number;
    totalDamagedUnits: number;
    totalAvailableUnits: number;
  };
  inventoryRows: InventoryAuditRow[];
  customRemarks?: string;
  auditor: string;
  president: string;
  treasurer: string;
}

const peso = (n: number) =>
  `PHP ${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const escapeHtml = (value: string) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch] || ch
  );

function matchesFund(fundSource: string | undefined, fund: OrganizationFund): boolean {
  const src = String(fundSource || "").trim().toLowerCase();
  if (!src) return false;
  const code = String(fund.code || "").trim().toLowerCase();
  const name = String(fund.name || "").trim().toLowerCase();
  if (code && (src === code || src.startsWith(`${code} `) || src.startsWith(`${code}(`) || src.includes(`(${code})`))) {
    return true;
  }
  return Boolean(name && src.includes(name));
}

export function buildAuditorReportData(params: {
  year?: number;
  generatedDate?: string;
  users?: User[];
  transactions?: FinancialTransaction[];
  funds?: OrganizationFund[];
  inventory?: InventoryItem[];
  livestockIgp?: LivestockIgpState;
  customRemarks?: string;
}): AuditorReportData {
  const year = params.year ?? new Date().getFullYear();
  const generatedDate = params.generatedDate || new Date().toISOString().split("T")[0];
  const users = params.users || [];
  const transactions = params.transactions || [];
  const funds = params.funds || [];
  const inventory = params.inventory || [];
  const livestockIgp = params.livestockIgp;

  const auditedTx = transactions.filter((t) => t.auditedStatus === "Audited");
  const flaggedTx = transactions.filter((t) => t.auditedStatus === "Flagged");
  const unauditedTx = transactions.filter((t) => !t.auditedStatus || t.auditedStatus === "Unaudited");

  const auditedCount = auditedTx.length;
  const flaggedCount = flaggedTx.length;
  const unauditedCount = unauditedTx.length;
  const totalTransactions = transactions.length;
  const coverageRate =
    totalTransactions > 0 ? ((auditedCount / totalTransactions) * 100).toFixed(1) : "100.0";

  const sumAmounts = (list: FinancialTransaction[]) =>
    list.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const presidentApprovedCount = auditedTx.filter((t) => t.presidentApprovalStatus === "Approved").length;
  const presidentReturnedCount = auditedTx.filter((t) => t.presidentApprovalStatus === "Returned").length;
  const presidentPendingCount = auditedTx.length - presidentApprovedCount - presidentReturnedCount;

  let opinion: AuditorReportData["opinion"];
  if (totalTransactions === 0) {
    opinion = {
      code: "no_activity",
      label: "No Financial Transactions Recorded",
      summary: "No treasury ledger entries are currently recorded for audit examination.",
    };
  } else if (flaggedCount > 0) {
    opinion = {
      code: "qualified",
      label: "Qualified Opinion — With Flagged Exceptions",
      summary: `${flaggedCount} transaction(s) totaling ${peso(sumAmounts(flaggedTx))} have been flagged for documentation, allocation, or receipt clarification before final clearance.`,
    };
  } else if (unauditedCount > 0) {
    opinion = {
      code: "pending",
      label: "In Progress — Pending Unaudited Records",
      summary: `${auditedCount} of ${totalTransactions} transaction(s) (${coverageRate}%) have been verified with zero exceptions; ${unauditedCount} entry/entries remain queued for examination.`,
    };
  } else {
    opinion = {
      code: "unqualified",
      label: "Unqualified Opinion — In Full Compliance",
      summary: `All ${totalTransactions} recorded transaction(s) have been examined and verified against supporting documentation and authorized fund allocations with zero unresolved exceptions.`,
    };
  }

  const fundCompliance: FundComplianceRow[] = funds.map((fund) => {
    const matched = transactions.filter((tx) => matchesFund(tx.fundSource, fund));
    const fAudited = matched.filter((tx) => tx.auditedStatus === "Audited").length;
    const fFlagged = matched.filter((tx) => tx.auditedStatus === "Flagged").length;
    const fUnaudited = matched.filter((tx) => !tx.auditedStatus || tx.auditedStatus === "Unaudited").length;

    let status: FundComplianceRow["status"] = "No Recorded Activity";
    if (fFlagged > 0) status = "Exception — Flagged Items";
    else if (fUnaudited > 0) status = "Pending Review";
    else if (fAudited > 0) status = "Verified & Compliant";

    return {
      code: fund.code,
      name: fund.name,
      description: fund.description || "Registered association fund",
      auditedCount: fAudited,
      unauditedCount: fUnaudited,
      flaggedCount: fFlagged,
      status,
    };
  });

  const flaggedTransactions: FlaggedTransactionRow[] = [...flaggedTx]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map((tx) => ({
      id: tx.id,
      date: tx.date || "—",
      category: tx.category || "Uncategorized",
      fundSource: tx.fundSource || "Unspecified",
      description: tx.description || "—",
      amount: Number(tx.amount || 0),
      auditNotes: tx.auditNotes || "Receipt / supporting document clarification required.",
      auditedBy: tx.auditedBy || resolveOfficerName(users, "Auditor"),
      auditedDate: tx.auditedDate || "—",
    }));

  const unauditedTransactions: UnauditedTransactionRow[] = [...unauditedTx]
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
    .map((tx) => ({
      id: tx.id,
      date: tx.date || "—",
      type: tx.type,
      category: tx.category || "Uncategorized",
      fundSource: tx.fundSource || "Unspecified",
      description: tx.description || "—",
      amount: Number(tx.amount || 0),
      recordedBy: tx.recordedBy || "Treasurer",
    }));

  const eggHarvests = livestockIgp?.eggHarvests || [];
  const pendingAuditHarvests = eggHarvests.filter((h) => h.status === "Pending Audit").length;
  const auditedHarvests = eggHarvests.filter((h) => h.status === "Audited").length;
  const signedHarvests = eggHarvests.filter((h) => h.status === "Signed").length;
  const returnedHarvests = eggHarvests.filter((h) => h.status === "Returned");
  const verifiedEggTotal = eggHarvests
    .filter((h) => h.status === "Audited" || h.status === "Signed")
    .reduce((sum, h) => sum + Number(h.eggCount || 0), 0);

  // Merge normalized livestockInventory with derived counts from stock expenses - sales
  const derivedLivestock = deriveIgpLivestockInventory(
    livestockIgp?.expenses || [],
    livestockIgp?.sales || [],
    livestockIgp?.produces?.[0]
  );
  const livestockByProduce = new Map<string, Record<string, number>>();
  for (const item of livestockIgp?.livestockInventory || []) {
    if (item?.produce) livestockByProduce.set(item.produce, { ...(item.stageBreakdown || {}) });
  }
  for (const item of derivedLivestock) {
    if (item?.produce) livestockByProduce.set(item.produce, { ...(item.stageBreakdown || {}) });
  }
  const livestockSnapshot: LivestockAuditRow[] = [];
  for (const [produce, stages] of livestockByProduce.entries()) {
    for (const [stage, count] of Object.entries(stages)) {
      const headCount = Math.max(0, Math.floor(Number(count) || 0));
      if (headCount > 0) {
        livestockSnapshot.push({ produce, stage, headCount });
      }
    }
  }
  livestockSnapshot.sort((a, b) => a.produce.localeCompare(b.produce) || a.stage.localeCompare(b.stage));
  const totalLivestockHeads = livestockSnapshot.reduce((sum, row) => sum + row.headCount, 0);

  const inventoryRows: InventoryAuditRow[] = inventory.map((item) => {
    const damagedQuantity = getInventoryDamagedQuantity(item);
    const availableQuantity = getAvailableInventoryQuantity(item);
    return {
      id: item.id,
      name: item.name,
      category: item.category || "Other",
      quantity: Number(item.quantity || 0),
      damagedQuantity,
      availableQuantity,
      unit: item.unit || "units",
      condition: item.condition || "Good",
      location: item.location || "—",
      notes: item.notes || "—",
      recordedBy: item.recordedBy || "Auditor",
      lastUpdated: item.lastUpdated || item.dateRecorded || "—",
    };
  });

  const goodCount = inventoryRows.filter((i) => i.condition === "Good").length;
  const needsRepairCount = inventoryRows.filter((i) => i.condition === "Needs Repair").length;
  const damagedLostCount = inventoryRows.filter((i) => i.condition === "Damaged" || i.condition === "Lost").length;
  const totalUnits = inventoryRows.reduce((sum, i) => sum + i.quantity, 0);
  const totalDamagedUnits = inventoryRows.reduce((sum, i) => sum + i.damagedQuantity, 0);
  const totalAvailableUnits = inventoryRows.reduce((sum, i) => sum + i.availableQuantity, 0);

  return {
    year,
    generatedDate,
    org: {
      name: "Alegria Farmers Association",
      abbr: "AFA",
      doleRegNo: "2315",
      province: "Cebu",
      municipality: "Tuburan",
      barangay: "Alegria",
      logoSrc: "/images/afa-logo.png",
    },
    opinion,
    coverage: {
      totalTransactions,
      auditedCount,
      flaggedCount,
      unauditedCount,
      coverageRate,
      auditedVolume: sumAmounts(auditedTx),
      flaggedVolume: sumAmounts(flaggedTx),
      unauditedVolume: sumAmounts(unauditedTx),
      presidentApprovedCount,
      presidentPendingCount,
      presidentReturnedCount,
    },
    fundCompliance,
    flaggedTransactions,
    unauditedTransactions,
    harvestAudit: {
      hasHarvestRecords: eggHarvests.length > 0,
      totalBatches: eggHarvests.length,
      pendingAuditCount: pendingAuditHarvests,
      auditedCount: auditedHarvests,
      signedCount: signedHarvests,
      returnedCount: returnedHarvests.length,
      verifiedEggTotal,
      returnedHarvests,
    },
    livestockSnapshot,
    totalLivestockHeads,
    inventorySummary: {
      totalItems: inventoryRows.length,
      goodCount,
      needsRepairCount,
      damagedLostCount,
      totalUnits,
      totalDamagedUnits,
      totalAvailableUnits,
    },
    inventoryRows,
    customRemarks: params.customRemarks?.trim() || undefined,
    auditor: resolveOfficerName(users, "Auditor"),
    president: resolveOfficerName(users, "President"),
    treasurer: resolveOfficerName(users, "Treasurer"),
  };
}

export function buildAuditorReportPrintHtml(data: AuditorReportData): string {
  const { org, opinion, coverage, fundCompliance, flaggedTransactions, unauditedTransactions, harvestAudit, livestockSnapshot, inventorySummary, inventoryRows } = data;
  const opinionColor =
    opinion.code === "unqualified"
      ? "#166534"
      : opinion.code === "qualified"
        ? "#b91c1c"
        : "#92400e";

  const statusColor = (status: FundComplianceRow["status"]) =>
    status === "Verified & Compliant"
      ? "#166534"
      : status === "Exception — Flagged Items"
        ? "#b91c1c"
        : status === "Pending Review"
          ? "#92400e"
          : "#475569";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>AFA Auditor's Oversight & Custodial Inspection Report (${data.year})</title>
  <style>
    @page { size: letter; margin: 0.55in; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10.5pt; line-height: 1.45; }
    .letterhead { display: grid; grid-template-columns: 74px 1fr 74px; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 2px solid #1b4332; text-align: center; }
    .letterhead img { width: 68px; height: 68px; object-fit: contain; }
    .gov { font-size: 9.5pt; line-height: 1.3; }
    .org-name { font-size: 13pt; font-weight: 800; color: #1b4332; margin-top: 3px; text-transform: uppercase; }
    .reg { font-size: 9pt; font-weight: 700; color: #334155; }
    .report-title { text-align: center; margin: 14px 0 4px; font-size: 12.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: #1b4332; }
    .report-sub { text-align: center; font-size: 9.5pt; color: #475569; margin: 0 0 14px; }
    .opinion-box { border: 1.5px solid ${opinionColor}; background: #f8fafc; padding: 10px 12px; border-radius: 6px; margin-bottom: 14px; }
    .opinion-label { font-weight: 800; color: ${opinionColor}; font-size: 10.5pt; text-transform: uppercase; }
    .opinion-summary { font-size: 9.5pt; color: #1e293b; margin-top: 3px; }
    h2 { font-size: 10.5pt; font-weight: 800; color: #1b4332; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin: 16px 0 8px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 9.2pt; }
    th, td { border: 1px solid #94a3b8; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #e6eee8; color: #1b4332; font-weight: 700; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .flagged-row { background: #fef2f2; }
    .muted { color: #64748b; font-size: 9pt; }
    .note { font-size: 8.5pt; color: #475569; margin-top: 6px; font-style: italic; }
    .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 22px; margin-top: 32px; page-break-inside: avoid; }
    .sig-col { text-align: center; }
    .sig-role { font-size: 8.5pt; color: #475569; margin-bottom: 34px; text-transform: uppercase; }
    .sig-line { border-top: 1px solid #111; padding-top: 4px; font-weight: 700; font-size: 9.5pt; }
    .sig-title { font-size: 8.5pt; color: #475569; }
    @media print { tr, .opinion-box { break-inside: avoid; } }
  </style>
</head>
<body>
  <header class="letterhead">
    <img src="${escapeHtml(org.logoSrc || "/images/afa-logo.png")}" alt="AFA Seal" onerror="this.style.visibility='hidden'" />
    <div>
      <div class="gov">
        Republic of the Philippines<br/>
        Province of ${escapeHtml(org.province)} · Municipality of ${escapeHtml(org.municipality)}<br/>
        Barangay ${escapeHtml(org.barangay)}
      </div>
      <div class="org-name">${escapeHtml(org.name)} (${escapeHtml(org.abbr)})</div>
      <div class="reg">DOLE Registration No. ${escapeHtml(org.doleRegNo)}</div>
    </div>
    <div aria-hidden="true"></div>
  </header>

  <div class="report-title">Auditor's Oversight &amp; Custodial Inspection Report</div>
  <p class="report-sub">Fiscal Year ${data.year} · Report Date: ${escapeHtml(data.generatedDate)} · Independent Verification &amp; Property Custody</p>

  <div class="opinion-box">
    <div class="opinion-label">Audit Finding: ${escapeHtml(opinion.label)}</div>
    <div class="opinion-summary">${escapeHtml(opinion.summary)}</div>
  </div>

  <h2>I. Audit Verification Coverage Summary</h2>
  <table>
    <thead>
      <tr><th>Audit Metric</th><th class="num">Record Count</th><th class="num">Total Value</th><th>Verification Standard</th></tr>
    </thead>
    <tbody>
      <tr><td>Total Transactions Examined</td><td class="num"><strong>${coverage.totalTransactions}</strong></td><td class="num"><strong>${escapeHtml(peso(coverage.auditedVolume + coverage.flaggedVolume + coverage.unauditedVolume))}</strong></td><td>AFA DOLE Reg. #${escapeHtml(org.doleRegNo)} Internal Audit Scope</td></tr>
      <tr><td>Verified &amp; Audited OK</td><td class="num" style="color:#166534;font-weight:700;">${coverage.auditedCount}</td><td class="num">${escapeHtml(peso(coverage.auditedVolume))}</td><td>Supported by official receipts &amp; vouchers</td></tr>
      <tr><td>Flagged Discrepancies</td><td class="num" style="color:#b91c1c;font-weight:700;">${coverage.flaggedCount}</td><td class="num">${escapeHtml(peso(coverage.flaggedVolume))}</td><td>Requires receipt / officer clarification</td></tr>
      <tr><td>Pending Unaudited Backlog</td><td class="num" style="color:#92400e;font-weight:700;">${coverage.unauditedCount}</td><td class="num">${escapeHtml(peso(coverage.unauditedVolume))}</td><td>Queued for audit examination</td></tr>
      <tr><td>Audit Coverage Rate</td><td class="num"><strong>${escapeHtml(coverage.coverageRate)}%</strong></td><td class="num">—</td><td>President Sign-Off on Audited: ${coverage.presidentApprovedCount} Approved · ${coverage.presidentPendingCount} Pending · ${coverage.presidentReturnedCount} Returned</td></tr>
    </tbody>
  </table>

  <h2>II. Fund Source Compliance Audit</h2>
  <table>
    <thead>
      <tr><th>Fund Code &amp; Account</th><th>Authorized Scope</th><th class="num">Audited</th><th class="num">Unaudited</th><th class="num">Flagged</th><th>Compliance Finding</th></tr>
    </thead>
    <tbody>
      ${fundCompliance.length > 0 ? fundCompliance.map((f) => `
        <tr>
          <td><strong>${escapeHtml(f.code)}</strong> — ${escapeHtml(f.name)}</td>
          <td>${escapeHtml(f.description)}</td>
          <td class="num">${f.auditedCount}</td>
          <td class="num">${f.unauditedCount}</td>
          <td class="num">${f.flaggedCount}</td>
          <td style="color:${statusColor(f.status)};font-weight:700;">${escapeHtml(f.status)}</td>
        </tr>
      `).join("") : `<tr><td colspan="6" class="muted">No registered fund accounts found.</td></tr>`}
    </tbody>
  </table>

  <h2>III. Flagged Discrepancies &amp; Unaudited Backlog</h2>
  <p class="muted" style="margin:2px 0 6px;"><strong>A. Flagged Transactions Requiring Action (${flaggedTransactions.length})</strong></p>
  <table>
    <thead>
      <tr><th>Date</th><th>Category</th><th>Fund Source</th><th>Description</th><th class="num">Amount</th><th>Audit Notes / Discrepancy</th></tr>
    </thead>
    <tbody>
      ${flaggedTransactions.length > 0 ? flaggedTransactions.map((tx) => `
        <tr class="flagged-row">
          <td>${escapeHtml(tx.date)}</td>
          <td>${escapeHtml(tx.category)}</td>
          <td>${escapeHtml(tx.fundSource)}</td>
          <td>${escapeHtml(tx.description)}</td>
          <td class="num">${escapeHtml(peso(tx.amount))}</td>
          <td>${escapeHtml(tx.auditNotes)}</td>
        </tr>
      `).join("") : `<tr><td colspan="6" style="color:#166534;font-weight:700;">No flagged discrepancies — all audited entries are clear.</td></tr>`}
    </tbody>
  </table>

  <p class="muted" style="margin:10px 0 6px;"><strong>B. Unaudited Transactions Queue (${unauditedTransactions.length})</strong></p>
  <table>
    <thead>
      <tr><th>Date</th><th>Type</th><th>Category</th><th>Fund Source</th><th>Description</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>
      ${unauditedTransactions.length > 0 ? unauditedTransactions.map((tx) => `
        <tr>
          <td>${escapeHtml(tx.date)}</td>
          <td>${escapeHtml(tx.type === "income" ? "Income" : "Expense")}</td>
          <td>${escapeHtml(tx.category)}</td>
          <td>${escapeHtml(tx.fundSource)}</td>
          <td>${escapeHtml(tx.description)}</td>
          <td class="num">${escapeHtml(peso(tx.amount))}</td>
        </tr>
      `).join("") : `<tr><td colspan="6" style="color:#166534;font-weight:700;">Zero unaudited backlog — 100% of ledger entries have been reviewed.</td></tr>`}
    </tbody>
  </table>

  <h2>IV. IGP Harvest &amp; Livestock Verification Audit</h2>
  ${harvestAudit.hasHarvestRecords ? `
  <p class="muted" style="margin:2px 0 6px;"><strong>A. Egg Harvest Verification Summary</strong></p>
  <table>
    <thead>
      <tr><th class="num">Total Submissions</th><th class="num">Verified (Audited)</th><th class="num">President Signed</th><th class="num">Pending Audit</th><th class="num">Returned</th><th class="num">Total Verified Eggs</th></tr>
    </thead>
    <tbody>
      <tr>
        <td class="num">${harvestAudit.totalBatches}</td>
        <td class="num">${harvestAudit.auditedCount}</td>
        <td class="num">${harvestAudit.signedCount}</td>
        <td class="num">${harvestAudit.pendingAuditCount}</td>
        <td class="num">${harvestAudit.returnedCount}</td>
        <td class="num"><strong>${harvestAudit.verifiedEggTotal.toLocaleString()}</strong></td>
      </tr>
    </tbody>
  </table>
  ` : `<p class="muted">No poultry egg harvest submissions recorded for this period.</p>`}

  <p class="muted" style="margin:8px 0 6px;"><strong>${harvestAudit.hasHarvestRecords ? "B. " : ""}Livestock Headcount Verification Snapshot (${data.totalLivestockHeads.toLocaleString()} Total Head)</strong></p>
  <table>
    <thead>
      <tr><th>IGP Project / Produce</th><th>Stage</th><th class="num">Recorded Head Count</th></tr>
    </thead>
    <tbody>
      ${livestockSnapshot.length > 0 ? livestockSnapshot.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.produce)}</strong></td>
          <td>${escapeHtml(row.stage)}</td>
          <td class="num"><strong>${row.headCount.toLocaleString()}</strong></td>
        </tr>
      `).join("") : `<tr><td colspan="3" class="muted">No active livestock headcounts recorded.</td></tr>`}
    </tbody>
  </table>

  <h2>V. Association Property &amp; Custodial Inventory Registry (Auditor's Custody)</h2>
  <table>
    <thead>
      <tr><th class="num">Registered Items</th><th class="num">Good</th><th class="num">Needs Repair</th><th class="num">Damaged / Lost</th><th class="num">Total Units</th><th class="num">Damaged Units</th><th class="num">Available Units</th></tr>
    </thead>
    <tbody>
      <tr>
        <td class="num"><strong>${inventorySummary.totalItems}</strong></td>
        <td class="num" style="color:#166534;font-weight:700;">${inventorySummary.goodCount}</td>
        <td class="num" style="color:#92400e;font-weight:700;">${inventorySummary.needsRepairCount}</td>
        <td class="num" style="color:#b91c1c;font-weight:700;">${inventorySummary.damagedLostCount}</td>
        <td class="num">${inventorySummary.totalUnits}</td>
        <td class="num">${inventorySummary.totalDamagedUnits}</td>
        <td class="num"><strong>${inventorySummary.totalAvailableUnits}</strong></td>
      </tr>
    </tbody>
  </table>

  <table>
    <thead>
      <tr><th>Item Name</th><th>Category</th><th class="num">Total</th><th class="num">Damaged</th><th class="num">Available</th><th>Condition</th><th>Location</th><th>Custodial Notes</th><th>Updated</th></tr>
    </thead>
    <tbody>
      ${inventoryRows.length > 0 ? inventoryRows.map((i) => `
        <tr>
          <td><strong>${escapeHtml(i.name)}</strong></td>
          <td>${escapeHtml(i.category)}</td>
          <td class="num">${i.quantity} ${escapeHtml(i.unit)}</td>
          <td class="num">${i.damagedQuantity}</td>
          <td class="num"><strong>${i.availableQuantity}</strong></td>
          <td>${escapeHtml(i.condition)}</td>
          <td>${escapeHtml(i.location)}</td>
          <td>${escapeHtml(i.notes)}</td>
          <td>${escapeHtml(i.lastUpdated)}</td>
        </tr>
      `).join("") : `<tr><td colspan="9" class="muted">No association inventory items recorded.</td></tr>`}
    </tbody>
  </table>

  ${data.customRemarks ? `
  <h2>VI. Auditor's Recommendations &amp; Remarks</h2>
  <p>${escapeHtml(data.customRemarks).replace(/\n/g, "<br/>")}</p>
  ` : ""}

  <p class="note">
    Segregation of Duties Notice: This report reflects independent audit verification and custodial property records maintained by the Auditor. Official financial statements and cash balances are issued separately by the Treasurer.
  </p>

  <div class="sigs">
    <div class="sig-col">
      <div class="sig-role">Prepared &amp; Certified By:</div>
      <div class="sig-line">${escapeHtml(data.auditor)}</div>
      <div class="sig-title">Association Auditor</div>
    </div>
    <div class="sig-col">
      <div class="sig-role">Noted By:</div>
      <div class="sig-line">${escapeHtml(data.president)}</div>
      <div class="sig-title">Association President</div>
    </div>
    <div class="sig-col">
      <div class="sig-role">Copy Furnished:</div>
      <div class="sig-line">${escapeHtml(data.treasurer)}</div>
      <div class="sig-title">Association Treasurer</div>
    </div>
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

export default function AuditorReport({
  data,
  hideToolbar = false,
}: {
  data: AuditorReportData;
  hideToolbar?: boolean;
}) {
  const restoreTitleRef = useRef<(() => void) | null>(null);

  const exportPdf = () => {
    const prev = document.title;
    document.title = `AFA-Auditor-Report-${data.year}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
      if (timer !== undefined) clearTimeout(timer);
    };
    restoreTitleRef.current = restore;
    window.addEventListener("afterprint", restore);
    window.print();
    timer = setTimeout(restore, 1000);
  };

  useEffect(() => () => { restoreTitleRef.current?.(); }, []);

  const { org, opinion, coverage, fundCompliance, flaggedTransactions, unauditedTransactions, harvestAudit, livestockSnapshot, inventorySummary, inventoryRows } = data;

  const opinionBadgeClass =
    opinion.code === "unqualified"
      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
      : opinion.code === "qualified"
        ? "border-rose-700 bg-rose-50 text-rose-900"
        : "border-amber-700 bg-amber-50 text-amber-900";

  return (
    <div className="pr-root">
      {!hideToolbar && (
        <div className="pr-toolbar no-print">
          <span>Auditor&apos;s Official Oversight &amp; Custodial Report · {data.year}</span>
          <button type="button" onClick={exportPdf} className="pr-btn">
            Print / Export PDF
          </button>
        </div>
      )}

      <article className="pr-page">
        <header className="pr-letterhead">
          <img
            src={org.logoSrc || "/images/afa-logo.png"}
            alt="AFA Seal"
            className="pr-logo"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
          />
          <div className="pr-gov-block">
            <div>Republic of the Philippines</div>
            <div>Province of {org.province} · Municipality of {org.municipality}</div>
            <div>Barangay {org.barangay}</div>
            <div className="pr-org-name">{org.name} ({org.abbr})</div>
            <div className="pr-reg">DOLE Registration No. {org.doleRegNo}</div>
          </div>
          <div aria-hidden="true" />
        </header>

        <h1 className="pr-title">Auditor&apos;s Oversight &amp; Custodial Inspection Report</h1>
        <p className="pr-subtitle">
          Fiscal Year {data.year} · Generated {data.generatedDate}
        </p>

        <div className={`rounded-lg border-2 p-3 mb-4 text-left ${opinionBadgeClass}`}>
          <div className="text-xs font-extrabold uppercase tracking-wide">
            Audit Finding: {opinion.label}
          </div>
          <p className="text-xs mt-1 leading-relaxed">{opinion.summary}</p>
        </div>

        <section className="pr-section">
          <h2>I. Audit Verification Coverage Summary</h2>
          <table className="pr-table">
            <thead>
              <tr>
                <th>Audit Metric</th>
                <th className="text-right">Count</th>
                <th className="text-right">Total Value</th>
                <th>Verification Standard</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total Transactions Examined</td>
                <td className="text-right font-bold">{coverage.totalTransactions}</td>
                <td className="text-right font-bold">
                  {peso(coverage.auditedVolume + coverage.flaggedVolume + coverage.unauditedVolume)}
                </td>
                <td>DOLE Reg. #{org.doleRegNo} Internal Audit Scope</td>
              </tr>
              <tr>
                <td>Verified &amp; Audited OK</td>
                <td className="text-right font-bold text-emerald-800">{coverage.auditedCount}</td>
                <td className="text-right">{peso(coverage.auditedVolume)}</td>
                <td>Supported by official receipts &amp; vouchers</td>
              </tr>
              <tr>
                <td>Flagged Discrepancies</td>
                <td className="text-right font-bold text-rose-700">{coverage.flaggedCount}</td>
                <td className="text-right">{peso(coverage.flaggedVolume)}</td>
                <td>Requires receipt / officer clarification</td>
              </tr>
              <tr>
                <td>Pending Unaudited Backlog</td>
                <td className="text-right font-bold text-amber-800">{coverage.unauditedCount}</td>
                <td className="text-right">{peso(coverage.unauditedVolume)}</td>
                <td>Queued for examination</td>
              </tr>
              <tr>
                <td>Audit Coverage Rate</td>
                <td className="text-right font-bold">{coverage.coverageRate}%</td>
                <td className="text-right">—</td>
                <td>
                  President Sign-Off: {coverage.presidentApprovedCount} Approved · {coverage.presidentPendingCount} Pending · {coverage.presidentReturnedCount} Returned
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="pr-section">
          <h2>II. Fund Source Compliance Audit</h2>
          <table className="pr-table">
            <thead>
              <tr>
                <th>Fund Account</th>
                <th>Authorized Scope</th>
                <th className="text-right">Audited</th>
                <th className="text-right">Unaudited</th>
                <th className="text-right">Flagged</th>
                <th>Compliance Finding</th>
              </tr>
            </thead>
            <tbody>
              {fundCompliance.length === 0 ? (
                <tr><td colSpan={6} className="text-slate-500">No registered fund accounts found.</td></tr>
              ) : (
                fundCompliance.map((f) => (
                  <tr key={f.code}>
                    <td><strong>{f.code}</strong> — {f.name}</td>
                    <td>{f.description}</td>
                    <td className="text-right">{f.auditedCount}</td>
                    <td className="text-right">{f.unauditedCount}</td>
                    <td className="text-right">{f.flaggedCount}</td>
                    <td className={
                      f.status === "Verified & Compliant"
                        ? "font-bold text-emerald-800"
                        : f.status === "Exception — Flagged Items"
                          ? "font-bold text-rose-700"
                          : f.status === "Pending Review"
                            ? "font-bold text-amber-800"
                            : "text-slate-600"
                    }>
                      {f.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="pr-section">
          <h2>III. Flagged Discrepancies &amp; Unaudited Backlog</h2>
          <p className="text-xs font-bold text-slate-700 mb-1">
            A. Flagged Transactions Requiring Action ({flaggedTransactions.length})
          </p>
          <table className="pr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Fund Source</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th>Audit Notes</th>
              </tr>
            </thead>
            <tbody>
              {flaggedTransactions.length === 0 ? (
                <tr><td colSpan={6} className="font-bold text-emerald-800">No flagged discrepancies — all audited entries are clear.</td></tr>
              ) : (
                flaggedTransactions.map((tx) => (
                  <tr key={tx.id} className="bg-rose-50">
                    <td>{tx.date}</td>
                    <td>{tx.category}</td>
                    <td>{tx.fundSource}</td>
                    <td>{tx.description}</td>
                    <td className="text-right">{peso(tx.amount)}</td>
                    <td>{tx.auditNotes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <p className="text-xs font-bold text-slate-700 mt-3 mb-1">
            B. Unaudited Transactions Queue ({unauditedTransactions.length})
          </p>
          <table className="pr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Fund Source</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {unauditedTransactions.length === 0 ? (
                <tr><td colSpan={6} className="font-bold text-emerald-800">Zero unaudited backlog — 100% of ledger entries have been reviewed.</td></tr>
              ) : (
                unauditedTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.date}</td>
                    <td>{tx.type === "income" ? "Income" : "Expense"}</td>
                    <td>{tx.category}</td>
                    <td>{tx.fundSource}</td>
                    <td>{tx.description}</td>
                    <td className="text-right">{peso(tx.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="pr-section">
          <h2>IV. IGP Harvest &amp; Livestock Verification Audit</h2>
          {harvestAudit.hasHarvestRecords ? (
            <>
              <p className="text-xs font-bold text-slate-700 mb-1">A. Egg Harvest Verification Summary</p>
              <table className="pr-table">
                <thead>
                  <tr>
                    <th className="text-right">Submissions</th>
                    <th className="text-right">Audited</th>
                    <th className="text-right">President Signed</th>
                    <th className="text-right">Pending</th>
                    <th className="text-right">Returned</th>
                    <th className="text-right">Verified Eggs</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-right">{harvestAudit.totalBatches}</td>
                    <td className="text-right">{harvestAudit.auditedCount}</td>
                    <td className="text-right">{harvestAudit.signedCount}</td>
                    <td className="text-right">{harvestAudit.pendingAuditCount}</td>
                    <td className="text-right">{harvestAudit.returnedCount}</td>
                    <td className="text-right font-bold">{harvestAudit.verifiedEggTotal.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-xs text-slate-500 mb-2">No poultry egg harvest submissions recorded for this period.</p>
          )}

          <p className="text-xs font-bold text-slate-700 mt-2 mb-1">
            {harvestAudit.hasHarvestRecords ? "B. " : ""}Livestock Headcount Verification Snapshot ({data.totalLivestockHeads.toLocaleString()} Total Head)
          </p>
          <table className="pr-table">
            <thead>
              <tr>
                <th>IGP Project / Produce</th>
                <th>Stage</th>
                <th className="text-right">Recorded Head Count</th>
              </tr>
            </thead>
            <tbody>
              {livestockSnapshot.length === 0 ? (
                <tr><td colSpan={3} className="text-slate-500">No active livestock headcounts recorded.</td></tr>
              ) : (
                livestockSnapshot.map((row) => (
                  <tr key={`${row.produce}::${row.stage}`}>
                    <td><strong>{row.produce}</strong></td>
                    <td>{row.stage}</td>
                    <td className="text-right font-bold">{row.headCount.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="pr-section">
          <h2>V. Association Property &amp; Custodial Inventory Registry (Auditor&apos;s Custody)</h2>
          <table className="pr-table">
            <thead>
              <tr>
                <th className="text-right">Items</th>
                <th className="text-right">Good</th>
                <th className="text-right">Needs Repair</th>
                <th className="text-right">Damaged / Lost</th>
                <th className="text-right">Total Units</th>
                <th className="text-right">Damaged Units</th>
                <th className="text-right">Available Units</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-right font-bold">{inventorySummary.totalItems}</td>
                <td className="text-right font-bold text-emerald-800">{inventorySummary.goodCount}</td>
                <td className="text-right font-bold text-amber-800">{inventorySummary.needsRepairCount}</td>
                <td className="text-right font-bold text-rose-700">{inventorySummary.damagedLostCount}</td>
                <td className="text-right">{inventorySummary.totalUnits}</td>
                <td className="text-right">{inventorySummary.totalDamagedUnits}</td>
                <td className="text-right font-bold">{inventorySummary.totalAvailableUnits}</td>
              </tr>
            </tbody>
          </table>

          <table className="pr-table mt-2">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th className="text-right">Total</th>
                <th className="text-right">Damaged</th>
                <th className="text-right">Available</th>
                <th>Condition</th>
                <th>Location</th>
                <th>Custodial Notes</th>
              </tr>
            </thead>
            <tbody>
              {inventoryRows.length === 0 ? (
                <tr><td colSpan={8} className="text-slate-500">No association inventory items recorded.</td></tr>
              ) : (
                inventoryRows.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.category}</td>
                    <td className="text-right">{item.quantity} {item.unit}</td>
                    <td className="text-right">{item.damagedQuantity}</td>
                    <td className="text-right font-bold">{item.availableQuantity}</td>
                    <td>{item.condition}</td>
                    <td>{item.location}</td>
                    <td>{item.notes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {data.customRemarks && (
          <section className="pr-section">
            <h2>VI. Auditor&apos;s Recommendations &amp; Remarks</h2>
            <p className="text-xs whitespace-pre-line">{data.customRemarks}</p>
          </section>
        )}

        <p className="text-[10px] italic text-slate-500 mt-3">
          Segregation of Duties Notice: This report reflects independent audit verification and custodial property records maintained by the Auditor. Official financial statements and cash balances are issued separately by the Treasurer.
        </p>

        <footer className="pr-signatures" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div className="pr-sig">
            <div className="pr-sig-role">Prepared &amp; Certified By:</div>
            <div className="pr-sig-line">{data.auditor}</div>
            <div className="pr-sig-title">Association Auditor</div>
          </div>
          <div className="pr-sig">
            <div className="pr-sig-role">Noted By:</div>
            <div className="pr-sig-line">{data.president}</div>
            <div className="pr-sig-title">Association President</div>
          </div>
          <div className="pr-sig">
            <div className="pr-sig-role">Copy Furnished:</div>
            <div className="pr-sig-line">{data.treasurer}</div>
            <div className="pr-sig-title">Association Treasurer</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
