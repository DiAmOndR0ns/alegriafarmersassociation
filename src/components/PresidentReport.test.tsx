import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import PresidentReport, { buildReportData, buildPresidentReportPrintHtml } from "./PresidentReport";
import OfficerReportModal from "./OfficerReportModal";
import type { User } from "../types";

const makeUser = (over: Partial<User> & { name: string }): User => ({
  role: "Member",
  contactNumber: "0917",
  ...over,
} as User);

describe("buildReportData", () => {
  it("falls back to the role title when no matching officer accounts exist", () => {
    const d = buildReportData({ year: 2025, users: [makeUser({ name: "Juan" })] });
    expect(d.secretary).toBe("AFA Secretary");
    expect(d.president).toBe("AFA President");
  });

  it("prefers live Secretary/President accounts over the fallbacks", () => {
    const d = buildReportData({
      year: 2025,
      users: [
        makeUser({ name: "Ana Santos", role: "Secretary" }),
        makeUser({ name: "Pedro Cruz", role: "President" }),
      ],
    });
    expect(d.secretary).toBe("Ana Santos");
    expect(d.president).toBe("Pedro Cruz");
  });

  it("excludes Members from the officers table", () => {
    const d = buildReportData({
      year: 2025,
      users: [
        makeUser({ name: "Officer One", role: "Treasurer" }),
        makeUser({ name: "Plain Member", role: "Member" }),
      ],
    });
    expect(d.officers.map((o) => o.name)).toEqual(["Officer One"]);
  });

  it("formats snake_case roles into readable position labels", () => {
    const d = buildReportData({
      year: 2025,
      users: [makeUser({ name: "Ana", role: "Vice_President" })],
    });
    expect(d.officers[0].position).toBe("Vice President");
  });
});

// @vitest-environment node
describe("PresidentReport rendering", () => {
  const baseData = buildReportData({ year: 2025 });

  it("renders the empty-state messages when there are no highlights, plans, or officers", () => {
    const html = renderToString(<PresidentReport data={baseData} />);
    expect(html).toContain("No highlights recorded for this year.");
    expect(html).toContain("No plans recorded for this year.");
    expect(html).toContain("No officers on record.");
  });

  it("auto-populates executive KPIs, highlights, resolutions, delegations, plans, and all officer roles without leaking peso ledgers", () => {
    const data = buildReportData({
      year: 2026,
      users: [
        makeUser({ id: "u-board", name: "Lito Ramos", role: "Board_Member" }),
        makeUser({ id: "u-pres", name: "Elena Villarin", role: "President" }),
        makeUser({ id: "u-sec", name: "Maria Santos", role: "Secretary" }),
        makeUser({ id: "u-asec", name: "Nora Reyes", role: "Assistant_Secretary" }),
        makeUser({ id: "u-aud", name: "Ramon Cruz", role: "Auditor" }),
        makeUser({ id: "u-vp", name: "Carlos Bautista", role: "Vice_President" }),
      ],
      members: [
        { id: "m1", name: "Farmer One", farmLocation: "Sitio Proper", primaryCrops: ["Corn"], contactNumber: "0917-111-1111", status: "Active", joinedDate: "2024-01-01", isRsbsaRegistered: true },
        { id: "m2", name: "Farmer Two", farmLocation: "Sitio Lapyahan", primaryCrops: ["Banana"], contactNumber: "0917-222-2222", status: "Active", joinedDate: "2024-02-01" },
      ],
      membershipPayments: [
        { id: "p1", memberId: "m1", memberName: "Farmer One", year: 2026, amount: 100, datePaid: "2026-01-15", method: "Cash", status: "Verified", recordedBy: "Treasurer", recordedAt: "2026-01-15" },
      ],
      meetings: [
        { id: "mt1", title: "Q1 Assembly", date: "2026-02-14", location: "Covered Court", attendanceCount: 40, agenda: "Updates", minutes: "Approved", officerInCharge: "Elena Villarin", minutesApprovalStatus: "Approved" },
      ],
      resolutions: [
        { id: "r1", resolutionNumber: "RES-2026-01", title: "Approve Poultry Coop Expansion", description: "Expand coop", dateAgreed: "2026-02-14", movedBy: "Carlos", secondedBy: "Lito", voteInFavor: 9, voteAgainst: 0, voteAbstain: 1, status: "Approved" },
      ],
      delegationRequests: [
        { id: "d1", requestedBy: "u-vp", reason: "Official travel", scopes: ["record_approval"], requestedDate: "2026-03-01", effectiveStart: "2026-03-02", effectiveEnd: "2026-03-05", status: "Approved" },
      ],
      transactions: [
        { id: "t1", type: "expense", category: "Feeds", amount: 99999, date: "2026-02-10", description: "Feeds purchase", recordedBy: "Treasurer", auditedStatus: "Audited", presidentApprovalStatus: "Approved" },
      ],
      activities: [
        { id: "a1", title: "Organic Composting Workshop", category: "Training", scheduledDate: "2026-02-20", scheduledTime: "08:00 AM", location: "Sitio Proper", description: "Hands-on demo", status: "Completed", organizer: "PIO", attendeesCount: 35 },
        { id: "a2", title: "Annual Harvest Festival", category: "Community", scheduledDate: "2027-01-18", scheduledTime: "09:00 AM", location: "Covered Court", description: "Festival", status: "Scheduled", organizer: "PIO" },
      ],
      achievements: [
        { id: "ach1", year: "2026", title: "DOLE Livelihood Award", description: "Recognized for sustainable poultry IGP", icon: "Trophy" },
      ],
      livestockIgp: {
        produces: ["Livestock", "Poultry Raising"],
        expenses: [],
        sales: [],
        eggHarvests: [
          { id: "h1", date: "2026-03-01", time: "06:30", collectedBy: "Pedro", eggCount: 420, status: "Signed" },
        ],
      },
      products: [
        { id: "pr1", name: "Organic Chicken Eggs", category: "Poultry", description: "Fresh free-range eggs", unit: "tray", price: 240, quantityAvailable: "14 trays", stockStatus: "In Stock", farmerName: "AFA", farmerSitio: "Sitio Proper", isPublished: true, updatedBy: "PIO", dateUpdated: "2026-03-01" },
      ],
      inventory: [
        { id: "i1", name: "Monoblock Chairs", category: "Rental Assets", quantity: 100, unit: "pcs", condition: "Good", recordedBy: "Auditor", dateRecorded: "2025-01-01", lastUpdated: "2026-01-01" },
      ],
    });

    // Canonical officer ordering includes Asst. Secretary & Board Member
    expect(data.officers.map((o) => o.position)).toEqual([
      "President",
      "Vice President",
      "Secretary",
      "Assistant Secretary",
      "Auditor",
      "Board Member",
    ]);
    expect(data.auditor).toBe("Ramon Cruz");
    expect(data.summary.duesComplianceRate).toBe("50.0");
    expect(data.summary.verifiedEggsTotal).toBe(420);
    expect(data.summary.presidentSignedTransactionsCount).toBe(1);
    expect(data.highlights.some((h) => h.includes("Organic Composting Workshop"))).toBe(true);
    expect(data.highlights.some((h) => h.includes("DOLE Livelihood Award"))).toBe(true);
    expect(data.plans.some((p) => p.includes("Annual Harvest Festival"))).toBe(true);

    const rendered = renderToString(<PresidentReport data={data} />).replace(/<!-- -->/g, "");
    const printHtml = buildPresidentReportPrintHtml(data);
    for (const out of [rendered, printHtml]) {
      expect(out).toContain("RES-2026-01");
      expect(out).toContain("Record Approvals");
      expect(out).toContain("Ramon Cruz");
      expect(out).toContain("420 verified eggs");
      // Segregation of duties: raw transaction peso amounts must never appear
      expect(out).not.toContain("99,999");
      expect(out).not.toContain("99999");
    }
  });

  it("unifies PresidentReport inside OfficerReportModal and hides fund balance cards for President", () => {
    const html = renderToString(
      <OfficerReportModal
        currentRole="President"
        users={[makeUser({ name: "Elena Villarin", role: "President" })]}
        members={[]}
        meetings={[]}
        resolutions={[]}
        transactions={[]}
        announcements={[]}
        logs={[]}
        funds={[
          { id: "f1", name: "Secret Treasury Fund", code: "STF", initialFund: 50000, currentBalance: 77777, description: "Cash", custodian: "Treasurer", lastUpdated: "2026-01-01" },
        ]}
        onClose={() => {}}
      />
    );

    expect(html).toContain("Unified DOLE Letterhead Report");
    expect(html).toContain("Preview DOLE Letterhead");
    expect(html).not.toContain("Source of Funds &amp; Budget Allocations Included in Report");
    expect(html).not.toContain("77,777");
  });
});
