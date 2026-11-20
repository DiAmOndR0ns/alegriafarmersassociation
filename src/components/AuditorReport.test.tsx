import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AuditorReport, {
  buildAuditorReportData,
  buildAuditorReportPrintHtml,
} from "./AuditorReport";
import type {
  FinancialTransaction,
  InventoryItem,
  LivestockIgpState,
  OrganizationFund,
  User,
} from "../types";

const sampleUsers: User[] = [
  { id: "u-aud", username: "auditor", name: "Maria Auditor", role: "Auditor", isApproved: true, joinedDate: "2025-01-01" },
  { id: "u-pres", username: "president", name: "Juan President", role: "President", isApproved: true, joinedDate: "2025-01-01" },
  { id: "u-tres", username: "treasurer", name: "Ana Treasurer", role: "Treasurer", isApproved: true, joinedDate: "2025-01-01" },
];

const sampleFunds: OrganizationFund[] = [
  { id: "f-1", code: "AFA-OP", name: "Operational Fund", description: "Day-to-day operations", initialFund: 50000, currentBalance: 50000, custodian: "Treasurer", lastUpdated: "2026-01-01" },
  { id: "f-2", code: "DOLE-IGP", name: "DOLE Livelihood Grant", description: "Livestock IGP capital", initialFund: 120000, currentBalance: 120000, custodian: "Treasurer", lastUpdated: "2026-01-01" },
];

const sampleTransactions: FinancialTransaction[] = [
  {
    id: "tx-1",
    date: "2026-02-01",
    type: "expense",
    category: "Feeds",
    description: "Layer feeds",
    amount: 5000,
    fundSource: "DOLE-IGP (DOLE Livelihood Grant)",
    recordedBy: "Treasurer",
    auditedStatus: "Audited",
    presidentApprovalStatus: "Approved",
  },
  {
    id: "tx-2",
    date: "2026-02-05",
    type: "expense",
    category: "Supplies",
    description: "Office supplies without OR",
    amount: 1200,
    fundSource: "AFA-OP (Operational Fund)",
    recordedBy: "Treasurer",
    auditedStatus: "Flagged",
    auditNotes: "Missing official receipt",
  },
  {
    id: "tx-3",
    date: "2026-02-10",
    type: "income",
    category: "Membership Dues",
    description: "Annual dues batch",
    amount: 3000,
    fundSource: "AFA-OP (Operational Fund)",
    recordedBy: "Treasurer",
    auditedStatus: "Unaudited",
  },
];

const sampleInventory: InventoryItem[] = [
  {
    id: "inv-1",
    name: "Monobloc Chairs",
    category: "Rental Assets",
    quantity: 50,
    damagedQuantity: 5,
    unit: "pieces",
    condition: "Needs Repair",
    location: "AFA Hall",
    notes: "5 cracked legs",
    recordedBy: "Maria Auditor",
    dateRecorded: "2026-01-10",
    lastUpdated: "2026-02-01",
  },
];

const sampleLivestockIgp: LivestockIgpState = {
  produces: ["Swine Raising (Baboyan)", "RTL Chickens"],
  livestockInventory: [
    { produce: "Swine Raising (Baboyan)", stageBreakdown: { Fattening: 10 } },
    { produce: "RTL Chickens", stageBreakdown: { RTL: 40 } },
  ],
  expenses: [],
  sales: [],
  eggHarvests: [
    { id: "eh-1", produce: "RTL Chickens", date: "2026-02-01", time: "08:00", collectedBy: "Member 1", eggCount: 120, status: "Signed" },
    { id: "eh-2", produce: "RTL Chickens", date: "2026-02-02", time: "08:00", collectedBy: "Member 2", eggCount: 90, status: "Pending Audit" },
  ],
};

describe("AuditorReport", () => {
  it("computes Qualified Opinion and data-driven fund compliance when flagged/unaudited items exist", () => {
    const data = buildAuditorReportData({
      year: 2026,
      generatedDate: "2026-02-15",
      users: sampleUsers,
      transactions: sampleTransactions,
      funds: sampleFunds,
      inventory: sampleInventory,
      livestockIgp: sampleLivestockIgp,
      customRemarks: "Follow up on OR for tx-2.",
    });

    expect(data.opinion.code).toBe("qualified");
    expect(data.opinion.label).toContain("Qualified Opinion");
    expect(data.coverage.auditedCount).toBe(1);
    expect(data.coverage.flaggedCount).toBe(1);
    expect(data.coverage.unauditedCount).toBe(1);

    const afaOp = data.fundCompliance.find((f) => f.code === "AFA-OP");
    const doleIgp = data.fundCompliance.find((f) => f.code === "DOLE-IGP");
    expect(afaOp?.status).toBe("Exception — Flagged Items");
    expect(doleIgp?.status).toBe("Verified & Compliant");

    expect(data.harvestAudit.verifiedEggTotal).toBe(120);
    expect(data.harvestAudit.pendingAuditCount).toBe(1);
    expect(data.totalLivestockHeads).toBe(50);
    expect(data.inventorySummary.totalUnits).toBe(50);
    expect(data.inventorySummary.totalDamagedUnits).toBe(5);
    expect(data.inventorySummary.totalAvailableUnits).toBe(45);
  });

  it("computes Unqualified Opinion when 100% of transactions are audited with zero flags", () => {
    const data = buildAuditorReportData({
      year: 2026,
      users: sampleUsers,
      transactions: [sampleTransactions[0]],
      funds: sampleFunds,
    });
    expect(data.opinion.code).toBe("unqualified");
    expect(data.opinion.label).toContain("Unqualified Opinion");
  });

  it("renders DOLE Reg. No. 2315 letterhead without CDA wording and escapes print HTML", () => {
    const data = buildAuditorReportData({
      year: 2026,
      generatedDate: "2026-02-15",
      users: sampleUsers,
      transactions: sampleTransactions,
      funds: sampleFunds,
      inventory: sampleInventory,
      livestockIgp: sampleLivestockIgp,
      customRemarks: "<script>alert(1)</script> Verified.",
    });

    const rendered = renderToStaticMarkup(<AuditorReport data={data} hideToolbar />);
    expect(rendered).toContain("DOLE Registration No. 2315");
    expect(rendered).not.toContain("Cooperative Development Authority");
    expect(rendered).toContain("Monobloc Chairs");

    const html = buildAuditorReportPrintHtml(data);
    expect(html).toContain("DOLE Registration No. 2315");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
