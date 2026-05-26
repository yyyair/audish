import * as vscode from 'vscode';
import { Campaign, Bookmark, Comment, CoverageData, CodeLink } from './models';
import { StorageManager } from './storageManager';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export class CampaignManager {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly storage: StorageManager) {}

  // --- Campaigns ---

  getCampaigns(): Campaign[] {
    return this.storage.getCampaignData().campaigns;
  }

  getActiveCampaignId(): string | undefined {
    return this.storage.getCampaignData().activeCampaignId;
  }

  getActiveCampaign(): Campaign | undefined {
    const data = this.storage.getCampaignData();
    return data.campaigns.find(c => c.id === data.activeCampaignId);
  }

  createCampaign(name: string, description: string): Campaign {
    const campaign: Campaign = {
      id: generateId(),
      name,
      description,
      createdAt: new Date().toISOString()
    };
    const data = this.storage.getCampaignData();
    data.campaigns.push(campaign);
    if (!data.activeCampaignId) {
      data.activeCampaignId = campaign.id;
    }
    this.storage.saveCampaignData(data);
    this._onDidChange.fire();
    return campaign;
  }

  setActiveCampaign(campaignId: string): void {
    const data = this.storage.getCampaignData();
    if (!data.campaigns.find(c => c.id === campaignId)) return;
    data.activeCampaignId = campaignId;
    this.storage.saveCampaignData(data);
    this._onDidChange.fire();
  }

  renameCampaign(campaignId: string, newName: string): void {
    const data = this.storage.getCampaignData();
    const campaign = data.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    campaign.name = newName;
    this.storage.saveCampaignData(data);
    this._onDidChange.fire();
  }

  deleteCampaign(campaignId: string): void {
    const data = this.storage.getCampaignData();
    data.campaigns = data.campaigns.filter(c => c.id !== campaignId);
    if (data.activeCampaignId === campaignId) {
      data.activeCampaignId = data.campaigns[0]?.id;
    }
    this.storage.saveCampaignData(data);
    this.storage.deleteCampaignData(campaignId);
    this._onDidChange.fire();
  }

  // --- Bookmarks ---

  getBookmarks(): Bookmark[] {
    const id = this.getActiveCampaignId();
    return id ? this.storage.getBookmarks(id) : [];
  }

  addBookmark(file: string, line: number, description: string): Bookmark {
    const id = this.getActiveCampaignId();
    if (!id) throw new Error('No active campaign');
    const bookmarks = this.storage.getBookmarks(id);
    const bookmark: Bookmark = {
      id: generateId(),
      file,
      line,
      description,
      createdAt: new Date().toISOString()
    };
    bookmarks.push(bookmark);
    this.storage.saveBookmarks(id, bookmarks);
    this._onDidChange.fire();
    return bookmark;
  }

  deleteBookmark(bookmarkId: string): void {
    const id = this.getActiveCampaignId();
    if (!id) return;
    const bookmarks = this.storage.getBookmarks(id).filter(b => b.id !== bookmarkId);
    this.storage.saveBookmarks(id, bookmarks);
    this._onDidChange.fire();
  }

  // --- Coverage ---

  getCoverage(): CoverageData {
    const id = this.getActiveCampaignId();
    return id ? this.storage.getCoverage(id) : {};
  }

  markLinesSeen(file: string, lines: number[]): void {
    const id = this.getActiveCampaignId();
    if (!id) throw new Error('No active campaign');
    const coverage = this.storage.getCoverage(id);
    const existing = new Set(coverage[file] ?? []);
    lines.forEach(l => existing.add(l));
    coverage[file] = Array.from(existing).sort((a, b) => a - b);
    this.storage.saveCoverage(id, coverage);
    this._onDidChange.fire();
  }

  unmarkLinesSeen(file: string, lines: number[]): void {
    const id = this.getActiveCampaignId();
    if (!id) throw new Error('No active campaign');
    const coverage = this.storage.getCoverage(id);
    const toRemove = new Set(lines);
    coverage[file] = (coverage[file] ?? []).filter(l => !toRemove.has(l));
    if (coverage[file].length === 0) delete coverage[file];
    this.storage.saveCoverage(id, coverage);
    this._onDidChange.fire();
  }

  // --- Comments ---

  getComments(): Comment[] {
    const id = this.getActiveCampaignId();
    return id ? this.storage.getComments(id) : [];
  }

  getCommentsForFile(file: string): Comment[] {
    return this.getComments().filter(c => c.file === file);
  }

  addComment(file: string, line: number, text: string, links: CodeLink[] = []): Comment {
    const id = this.getActiveCampaignId();
    if (!id) throw new Error('No active campaign');
    const comments = this.storage.getComments(id);
    const now = new Date().toISOString();
    const comment: Comment = {
      id: generateId(),
      file,
      line,
      text,
      links,
      createdAt: now,
      updatedAt: now
    };
    comments.push(comment);
    this.storage.saveComments(id, comments);
    this._onDidChange.fire();
    return comment;
  }

  editComment(commentId: string, text: string, links: CodeLink[]): void {
    const id = this.getActiveCampaignId();
    if (!id) return;
    const comments = this.storage.getComments(id);
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    comment.text = text;
    comment.links = links;
    comment.updatedAt = new Date().toISOString();
    this.storage.saveComments(id, comments);
    this._onDidChange.fire();
  }

  deleteComment(commentId: string): void {
    const id = this.getActiveCampaignId();
    if (!id) return;
    const comments = this.storage.getComments(id).filter(c => c.id !== commentId);
    this.storage.saveComments(id, comments);
    this._onDidChange.fire();
  }
}
