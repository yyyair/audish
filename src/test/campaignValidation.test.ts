import { validateCampaignName } from '../campaignValidation';

describe('validateCampaignName', () => {
  it('returns null for a plain valid name', () => {
    expect(validateCampaignName('Understanding DB Flow')).toBeNull();
  });

  it('returns an error for an empty string', () => {
    expect(validateCampaignName('')).toBeTruthy();
  });

  it('returns an error for a whitespace-only string', () => {
    expect(validateCampaignName('   ')).toBeTruthy();
  });

  it('returns null for a name with leading/trailing whitespace around valid content', () => {
    expect(validateCampaignName('  Valid Name  ')).toBeNull();
  });

  it.each(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])(
    'returns an error for a name containing "%s"',
    (char) => {
      expect(validateCampaignName(`campaign${char}name`)).toBeTruthy();
    }
  );

  it('returns an error when the name starts with an unsafe character', () => {
    expect(validateCampaignName('<script>')).toBeTruthy();
  });

  it('returns an error when the name contains a path separator', () => {
    expect(validateCampaignName('some/path')).toBeTruthy();
    expect(validateCampaignName('some\\path')).toBeTruthy();
  });

  it('returns null for names with hyphens, underscores, dots, and parens', () => {
    expect(validateCampaignName('audit-2024_final (v2)')).toBeNull();
  });

  it('returns null for unicode letters', () => {
    expect(validateCampaignName('Überprüfung réseau')).toBeNull();
  });
});
