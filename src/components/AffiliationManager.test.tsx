// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AffiliationManager, {
  PRESET_AFFILIATIONS,
  isPresetSelected
} from './AffiliationManager';
import { MemberAffiliation } from '../types';

const senior = PRESET_AFFILIATIONS[0];

function render(affiliations: MemberAffiliation[], disabled = false) {
  return renderToStaticMarkup(
    <AffiliationManager affiliations={affiliations} onChange={() => {}} disabled={disabled} />
  );
}

describe('isPresetSelected', () => {
  it('matches names case-insensitively and ignores surrounding whitespace', () => {
    const list: MemberAffiliation[] = [
      { id: 'a1', name: '  senior citizen id ', idNumber: '', type: 'Senior Citizen' }
    ];
    expect(isPresetSelected(list, 'Senior Citizen ID')).toBe(true);
    expect(isPresetSelected(list, 'PWD ID')).toBe(false);
  });

  it('does not throw when a stored affiliation has no name', () => {
    const list = [{ id: 'a1' } as unknown as MemberAffiliation];
    expect(isPresetSelected(list, 'PWD ID')).toBe(false);
  });
});

describe('AffiliationManager rendering', () => {
  it('disables an already selected preset pill (duplicate prevention)', () => {
    const markup = render([{ id: 'a1', name: senior.name, idNumber: '', type: senior.type }]);
    const pills = markup.split('<button');
    const seniorPill = pills.find(p => p.includes(senior.name)) ?? '';
    expect(seniorPill).toContain('disabled');
  });

  it('leaves unselected presets clickable', () => {
    const markup = render([]);
    const pwd = PRESET_AFFILIATIONS[1];
    const pill = (markup.split('<button').find(p => p.includes(pwd.name)) ?? '');
    expect(pill).not.toContain('disabled');
  });

  it('renders current affiliations with their name and id number values', () => {
    const markup = render([
      { id: 'legacy-row', name: 'Custom Org', idNumber: 'ORG-001', type: 'Other' }
    ]);
    expect(markup).toContain('value="Custom Org"');
    expect(markup).toContain('value="ORG-001"');
  });

  it('keeps the Add More button visible when the list is empty', () => {
    expect(render([])).toContain('Add More');
  });

  it('hides the Add More button and preset pills when disabled', () => {
    const markup = render(
      [{ id: 'a1', name: 'Custom Org', idNumber: '', type: 'Other' }],
      true
    );
    expect(markup).not.toContain('Add More');
    expect(markup).not.toContain('Quick Selection');
  });

  it('does not render a delete button when disabled', () => {
    const active = render([{ id: 'a1', name: 'Custom Org', idNumber: '', type: 'Other' }]);
    const locked = render([{ id: 'a1', name: 'Custom Org', idNumber: '', type: 'Other' }], true);
    expect(active).toContain('Tangtanga kini nga ID / organisasyon');
    expect(locked).not.toContain('Tangtanga kini nga ID / organisasyon');
  });
});

describe('AffiliationManager callbacks', () => {
  it('exposes a stable onChange contract for the parent form', () => {
    const onChange = vi.fn();
    renderToStaticMarkup(<AffiliationManager affiliations={[]} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
