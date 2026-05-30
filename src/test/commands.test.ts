import { countFileLines } from '../fileUtils';

describe('countFileLines', () => {
  it('returns 0 for an empty file', () => {
    expect(countFileLines('')).toBe(0);
  });

  it('returns 1 for a single line without trailing newline', () => {
    expect(countFileLines('hello')).toBe(1);
  });

  it('returns 1 for a single line with a trailing newline', () => {
    expect(countFileLines('hello\n')).toBe(1);
  });

  it('returns 2 for two lines without trailing newline', () => {
    expect(countFileLines('line1\nline2')).toBe(2);
  });

  it('returns 2 for two lines with a trailing newline (LF)', () => {
    expect(countFileLines('line1\nline2\n')).toBe(2);
  });

  it('returns 2 for two lines with Windows CRLF line endings and trailing CRLF', () => {
    expect(countFileLines('line1\r\nline2\r\n')).toBe(2);
  });

  it('returns 2 for two lines with Windows CRLF line endings and no trailing newline', () => {
    expect(countFileLines('line1\r\nline2')).toBe(2);
  });

  it('returns 1 for a file containing only a newline', () => {
    expect(countFileLines('\n')).toBe(1);
  });
});
