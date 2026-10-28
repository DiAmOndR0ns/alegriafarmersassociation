import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import PresidentReport, { buildReportData } from "./PresidentReport";
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
});
