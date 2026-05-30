export function countFileLines(content: string): number {
  const parts = content.split(/\r?\n/);
  return parts.length > 0 && parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
}
