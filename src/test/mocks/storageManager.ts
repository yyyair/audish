import { Campaign, CampaignData, Bookmark, CoverageData, Comment } from '../../models';

export class MockStorageManager {
  private _campaigns: CampaignData = { campaigns: [], activeCampaignId: undefined };
  private _bookmarks = new Map<string, Bookmark[]>();
  private _coverage = new Map<string, CoverageData>();
  private _comments = new Map<string, Comment[]>();

  getCampaignData(): CampaignData { return JSON.parse(JSON.stringify(this._campaigns)); }
  saveCampaignData(data: CampaignData): void { this._campaigns = JSON.parse(JSON.stringify(data)); }

  getBookmarks(id: string): Bookmark[] { return [...(this._bookmarks.get(id) ?? [])]; }
  saveBookmarks(id: string, bms: Bookmark[]): void { this._bookmarks.set(id, [...bms]); }

  getCoverage(id: string): CoverageData { return { ...(this._coverage.get(id) ?? {}) }; }
  saveCoverage(id: string, cov: CoverageData): void { this._coverage.set(id, { ...cov }); }

  getComments(id: string): Comment[] { return [...(this._comments.get(id) ?? [])]; }
  saveComments(id: string, cms: Comment[]): void { this._comments.set(id, [...cms]); }

  toRelativePath(abs: string): string { return abs.replace('/workspace/', ''); }
  toAbsolutePath(rel: string): string { return `/workspace/${rel}`; }

  deleteCampaignData(id: string): void {
    this._bookmarks.delete(id);
    this._coverage.delete(id);
    this._comments.delete(id);
  }

  exportCampaign(id: string, campaign: Campaign): object { return { campaign }; }
  importCampaign(_data: any): void {}
}
