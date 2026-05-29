import { CampaignManager } from '../campaignManager';
import { MockStorageManager } from './mocks/storageManager';

function makeManager() {
  const storage = new MockStorageManager();
  const manager = new CampaignManager(storage as any);
  return { storage, manager };
}

describe('CampaignManager — campaigns', () => {
  it('creates the first campaign and sets it as active', () => {
    const { manager } = makeManager();
    const c = manager.createCampaign('Alpha', 'desc');
    expect(manager.getActiveCampaignId()).toBe(c.id);
    expect(manager.getCampaigns()).toHaveLength(1);
  });

  it('does not change the active campaign when one already exists', () => {
    const { manager } = makeManager();
    const c1 = manager.createCampaign('First', '');
    manager.createCampaign('Second', '');
    expect(manager.getActiveCampaignId()).toBe(c1.id);
  });

  it('switches the active campaign', () => {
    const { manager } = makeManager();
    manager.createCampaign('First', '');
    const c2 = manager.createCampaign('Second', '');
    manager.setActiveCampaign(c2.id);
    expect(manager.getActiveCampaignId()).toBe(c2.id);
  });

  it('renames a campaign', () => {
    const { manager } = makeManager();
    const c = manager.createCampaign('Old', '');
    manager.renameCampaign(c.id, 'New');
    expect(manager.getCampaigns()[0].name).toBe('New');
  });

  it('deletes a campaign and clears active when it was the active one', () => {
    const { manager } = makeManager();
    const c = manager.createCampaign('Only', '');
    manager.deleteCampaign(c.id);
    expect(manager.getCampaigns()).toHaveLength(0);
    expect(manager.getActiveCampaignId()).toBeUndefined();
  });

  it('falls back to the first remaining campaign when the active one is deleted', () => {
    const { manager } = makeManager();
    const c1 = manager.createCampaign('First', '');
    const c2 = manager.createCampaign('Second', '');
    manager.setActiveCampaign(c1.id);
    manager.deleteCampaign(c1.id);
    expect(manager.getActiveCampaignId()).toBe(c2.id);
  });

  it('fires onDidChange after mutations', () => {
    const { manager } = makeManager();
    const spy = jest.fn();
    manager.onDidChange(spy);
    manager.createCampaign('X', '');
    expect(spy).toHaveBeenCalledTimes(1);
    manager.createCampaign('Y', '');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('CampaignManager — comments', () => {
  it('adds a comment to the active campaign', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    manager.addComment('src/foo.ts', 10, 'note', []);
    expect(manager.getCommentsForFile('src/foo.ts')).toHaveLength(1);
  });

  it('addComment returns the created comment with the correct fields', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    const c = manager.addComment('src/foo.ts', 5, 'hello', []);
    expect(c.text).toBe('hello');
    expect(c.line).toBe(5);
    expect(c.file).toBe('src/foo.ts');
    expect(c.id).toBeTruthy();
  });

  it('edits an existing comment', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    const c = manager.addComment('a.ts', 0, 'original', []);
    manager.editComment(c.id, 'updated', []);
    expect(manager.getCommentsForFile('a.ts')[0].text).toBe('updated');
  });

  it('updates updatedAt timestamp on edit', () => {
    jest.useFakeTimers();
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');

    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const c = manager.addComment('a.ts', 0, 'original', []);
    const createdAt = c.updatedAt; // capture before in-place mutation

    jest.setSystemTime(new Date('2024-01-01T00:01:00Z'));
    manager.editComment(c.id, 'updated', []);
    expect(manager.getCommentsForFile('a.ts')[0].updatedAt).not.toBe(createdAt);

    jest.useRealTimers();
  });

  it('deletes a comment', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    const c = manager.addComment('a.ts', 0, 'bye', []);
    manager.deleteComment(c.id);
    expect(manager.getCommentsForFile('a.ts')).toHaveLength(0);
  });

  it('getCommentsForFile filters by file', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 1, 'in a', []);
    manager.addComment('b.ts', 2, 'in b', []);
    expect(manager.getCommentsForFile('a.ts')).toHaveLength(1);
    expect(manager.getCommentsForFile('b.ts')).toHaveLength(1);
    expect(manager.getCommentsForFile('c.ts')).toHaveLength(0);
  });

  it('returns empty array when no campaign is active', () => {
    const { manager } = makeManager();
    expect(manager.getComments()).toHaveLength(0);
    expect(manager.getCommentsForFile('any.ts')).toHaveLength(0);
  });

  it('throws when adding a comment with no active campaign', () => {
    const { manager } = makeManager();
    expect(() => manager.addComment('a.ts', 0, 'x', [])).toThrow('No active campaign');
  });
});

describe('CampaignManager — coverage', () => {
  it('marks lines as seen', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    manager.markLinesSeen('file.ts', [1, 3, 5]);
    expect(manager.getCoverage()['file.ts']).toEqual([1, 3, 5]);
  });

  it('deduplicates lines across multiple markLinesSeen calls', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    manager.markLinesSeen('file.ts', [1, 2]);
    manager.markLinesSeen('file.ts', [2, 3]);
    expect(manager.getCoverage()['file.ts']).toEqual([1, 2, 3]);
  });

  it('stores lines in sorted order', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    manager.markLinesSeen('file.ts', [10, 2, 5]);
    expect(manager.getCoverage()['file.ts']).toEqual([2, 5, 10]);
  });

  it('unmarks specific lines', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    manager.markLinesSeen('file.ts', [1, 2, 3]);
    manager.unmarkLinesSeen('file.ts', [2]);
    expect(manager.getCoverage()['file.ts']).toEqual([1, 3]);
  });

  it('removes the file entry when all lines are unmarked', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    manager.markLinesSeen('file.ts', [1]);
    manager.unmarkLinesSeen('file.ts', [1]);
    expect(manager.getCoverage()['file.ts']).toBeUndefined();
  });
});

describe('CampaignManager — bookmarks', () => {
  it('adds and deletes a bookmark', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    const b = manager.addBookmark('file.ts', 5, 'entry point');
    expect(manager.getBookmarks()).toHaveLength(1);
    manager.deleteBookmark(b.id);
    expect(manager.getBookmarks()).toHaveLength(0);
  });

  it('returns empty array when no campaign is active', () => {
    const { manager } = makeManager();
    expect(manager.getBookmarks()).toHaveLength(0);
  });

  it('throws when adding a bookmark with no active campaign', () => {
    const { manager } = makeManager();
    expect(() => manager.addBookmark('file.ts', 0, 'x')).toThrow('No active campaign');
  });

  it('addBookmark returns the created bookmark with the correct fields', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    const b = manager.addBookmark('src/foo.ts', 10, 'entry point');
    expect(b.file).toBe('src/foo.ts');
    expect(b.line).toBe(10);
    expect(b.description).toBe('entry point');
    expect(b.id).toBeTruthy();
    expect(b.createdAt).toBeTruthy();
  });

  it('bookmarks are scoped to the active campaign', () => {
    const { manager } = makeManager();
    const c1 = manager.createCampaign('First', '');
    manager.addBookmark('file.ts', 1, 'in first');
    const c2 = manager.createCampaign('Second', '');
    manager.setActiveCampaign(c2.id);
    expect(manager.getBookmarks()).toHaveLength(0);
    manager.setActiveCampaign(c1.id);
    expect(manager.getBookmarks()).toHaveLength(1);
  });

  it('fires onDidChange after adding and deleting a bookmark', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    const spy = jest.fn();
    manager.onDidChange(spy);
    const b = manager.addBookmark('file.ts', 0, '');
    expect(spy).toHaveBeenCalledTimes(1);
    manager.deleteBookmark(b.id);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('deleteBookmark does nothing when no campaign is active', () => {
    const { manager } = makeManager();
    expect(() => manager.deleteBookmark('nonexistent')).not.toThrow();
  });

  it('covered lines do not appear in getBookmarks — coverage and bookmarks are independent data', () => {
    const { manager } = makeManager();
    manager.createCampaign('Camp', '');
    manager.addBookmark('file.ts', 5, 'marked');
    manager.markLinesSeen('file.ts', [5]);
    // Both exist independently — the decoration layer resolves the overlap
    expect(manager.getBookmarks()).toHaveLength(1);
    expect(manager.getCoverage()['file.ts']).toContain(5);
  });
});
