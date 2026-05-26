import { parseRefs } from '../linkResolver';

describe('parseRefs', () => {
  it('parses a bare file reference', () => {
    const [ref] = parseRefs('@foo');
    expect(ref.raw).toBe('@foo');
    expect(ref.isSymbol).toBe(false);
    expect(ref.name).toBe('foo');
    expect(ref.line).toBeUndefined();
  });

  it('parses a file reference with a line number (converts 1-based to 0-based)', () => {
    const [ref] = parseRefs('@foo.ts:10');
    expect(ref.name).toBe('foo.ts');
    expect(ref.line).toBe(9);
  });

  it('parses a path reference including slashes and dots', () => {
    const [ref] = parseRefs('@src/utils/helper.ts');
    expect(ref.isSymbol).toBe(false);
    expect(ref.name).toBe('src/utils/helper.ts');
  });

  it('parses a path reference with a line number', () => {
    const [ref] = parseRefs('@src/utils/helper.ts:42');
    expect(ref.name).toBe('src/utils/helper.ts');
    expect(ref.line).toBe(41);
  });

  it('parses a symbol reference', () => {
    const [ref] = parseRefs('@#myFunction');
    expect(ref.raw).toBe('@#myFunction');
    expect(ref.isSymbol).toBe(true);
    expect(ref.name).toBe('myFunction');
    expect(ref.line).toBeUndefined();
  });

  it('parses multiple references from a single string', () => {
    const refs = parseRefs('see @foo.ts:5 and @#Bar for details');
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ name: 'foo.ts', line: 4 });
    expect(refs[1]).toMatchObject({ isSymbol: true, name: 'Bar' });
  });

  it('returns an empty array when there are no references', () => {
    expect(parseRefs('no references here')).toHaveLength(0);
    expect(parseRefs('')).toHaveLength(0);
  });

  it('line 1 converts to 0', () => {
    const [ref] = parseRefs('@file:1');
    expect(ref.line).toBe(0);
  });

  it('is idempotent — calling twice on the same string returns the same result', () => {
    const text = '@a.ts:3 and @#Sym';
    expect(parseRefs(text)).toEqual(parseRefs(text));
  });
});
