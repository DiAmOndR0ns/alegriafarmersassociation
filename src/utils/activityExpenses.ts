import { AssociationActivity } from '../types';

export function isActivityOpenForExpenses(activity: AssociationActivity) {
  return activity.status === 'Scheduled' || activity.status === 'In Progress';
}
