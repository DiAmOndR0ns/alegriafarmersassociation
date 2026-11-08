import { describe, expect, it } from 'vitest';
import { AssociationActivity } from '../types';
import { isActivityOpenForExpenses } from './activityExpenses';

const makeActivity = (status: AssociationActivity['status']): AssociationActivity => ({
  id: 'activity-1',
  title: 'Farmers Training',
  category: 'Training',
  scheduledDate: '2026-11-10',
  scheduledTime: '09:00',
  location: 'AFA Center',
  description: 'Training event',
  status,
  organizer: 'PIO'
});

describe('activity expense lifecycle', () => {
  it.each(['Scheduled', 'In Progress'] as const)('allows linked expenses while %s', status => {
    expect(isActivityOpenForExpenses(makeActivity(status))).toBe(true);
  });

  it.each(['Completed', 'Postponed', 'Cancelled'] as const)('closes linked expenses when %s', status => {
    expect(isActivityOpenForExpenses(makeActivity(status))).toBe(false);
  });
});
