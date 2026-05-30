const UNSAFE_CHARS = /[<>:"/\\|?*]/;

export function validateCampaignName(value: string): string | null {
  if (!value.trim()) return 'Name is required';
  if (UNSAFE_CHARS.test(value)) return 'Name may not contain < > : " / \\ | ? *';
  return null;
}
