import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FinancialStatement from './FinancialStatement';
import TreasurerFinancialReport from './TreasurerFinancialReport';
import OfficerReportModal from './OfficerReportModal';
import { AssociationActivity, FinancialTransaction } from '../types';

const transactions: FinancialTransaction[] = [
  {
    id: 'income-2025',
    type: 'income',
    category: 'Donation',
    amount: 1200,
    date: '2025-03-15',
    description: 'Activity contribution',
    activityId: 'activity-1',
    recordedBy: 'Treasurer',
    auditedStatus: 'Unaudited'
  },
  {
    id: 'expense-2025',
    type: 'expense',
    category: 'Supplies',
    amount: 300,
    date: '2025-03-16',
    description: 'Activity supplies',
    activityId: 'activity-1',
    recordedBy: 'Treasurer',
    auditedStatus: 'Unaudited'
  },
  {
    id: 'income-2026',
    type: 'income',
    category: 'Donation',
    amount: 98765,
    date: '2026-03-15',
    description: 'Following-year contribution',
    activityId: 'activity-1',
    recordedBy: 'Treasurer',
    auditedStatus: 'Unaudited'
  }
];

const activities: AssociationActivity[] = [{
  id: 'activity-1',
  title: 'Farmers Training',
  category: 'Training',
  scheduledDate: '2025-03-15',
  scheduledTime: '09:00',
  location: 'AFA Center',
  description: 'Annual training',
  status: 'Completed',
  organizer: 'PIO'
}];

describe('annual financial reports', () => {
  it('limits ledger totals and activity summaries to the selected year', () => {
    const markup = renderToStaticMarkup(
      <TreasurerFinancialReport year={2025} transactions={transactions} activities={activities} funds={[]} />
    );

    expect(markup).toContain('Farmers Training');
    expect(markup).toContain('1,200.00');
    expect(markup).toContain('300.00');
    expect(markup).not.toContain('98,765.00');
  });

  it('applies the same year filter to the alternate printable statement', () => {
    const markup = renderToStaticMarkup(
      <FinancialStatement year={2025} transactions={transactions} activities={activities} />
    );

    expect(markup).toContain('Farmers Training');
    expect(markup).toContain('1,200.00');
    expect(markup).toContain('300.00');
    expect(markup).not.toContain('98,765.00');
  });

  it('shows Treasurer day, week, month, record type, and category controls in the report center', () => {
    const markup = renderToStaticMarkup(
      <OfficerReportModal
        currentRole="Treasurer"
        users={[]}
        members={[]}
        meetings={[]}
        resolutions={[]}
        transactions={transactions}
        announcements={[]}
        logs={[]}
        funds={[]}
        onClose={() => {}}
      />
    );

    expect(markup).toContain('Treasurer Activity Report');
    expect(markup).toContain('One day');
    expect(markup).toContain('One week (Monday to Sunday)');
    expect(markup).toContain('One month');
    expect(markup).toContain('Livestock sale proceeds only');
    expect(markup).toContain('treasurer-report-category');
  });
});
