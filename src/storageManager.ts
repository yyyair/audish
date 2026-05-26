import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Campaign, CampaignData, Bookmark, CoverageData, Comment } from './models';
import { logError } from './logger';

export class StorageManager {
  private rootPath: string;
  private audishDir: string;

  constructor() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error('No workspace folder open');
    }
    this.rootPath = folders[0].uri.fsPath;
    this.audishDir = path.join(this.rootPath, '.audish');
    this.ensureDir(this.audishDir);
  }

  private ensureDir(dir: string): void {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      logError('StorageManager.ensureDir', err);
      throw err;
    }
  }

  private readJson<T>(filePath: string, defaultValue: T): T {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
      }
    } catch (err) {
      logError(`StorageManager.readJson(${path.basename(filePath)})`, err);
      // fall through to default
    }
    return defaultValue;
  }

  private writeJson(filePath: string, data: unknown): void {
    try {
      this.ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      logError(`StorageManager.writeJson(${path.basename(filePath)})`, err);
      throw err;
    }
  }

  getCampaignData(): CampaignData {
    return this.readJson(path.join(this.audishDir, 'campaigns.json'), {
      campaigns: [],
      activeCampaignId: undefined
    });
  }

  saveCampaignData(data: CampaignData): void {
    this.writeJson(path.join(this.audishDir, 'campaigns.json'), data);
  }

  getBookmarks(campaignId: string): Bookmark[] {
    return this.readJson(path.join(this.audishDir, campaignId, 'bookmarks.json'), []);
  }

  saveBookmarks(campaignId: string, bookmarks: Bookmark[]): void {
    this.writeJson(path.join(this.audishDir, campaignId, 'bookmarks.json'), bookmarks);
  }

  getCoverage(campaignId: string): CoverageData {
    return this.readJson(path.join(this.audishDir, campaignId, 'coverage.json'), {});
  }

  saveCoverage(campaignId: string, coverage: CoverageData): void {
    this.writeJson(path.join(this.audishDir, campaignId, 'coverage.json'), coverage);
  }

  getComments(campaignId: string): Comment[] {
    return this.readJson(path.join(this.audishDir, campaignId, 'comments.json'), []);
  }

  saveComments(campaignId: string, comments: Comment[]): void {
    this.writeJson(path.join(this.audishDir, campaignId, 'comments.json'), comments);
  }

  toRelativePath(absolutePath: string): string {
    return path.relative(this.rootPath, absolutePath).replace(/\\/g, '/');
  }

  toAbsolutePath(relativePath: string): string {
    return path.join(this.rootPath, relativePath);
  }

  deleteCampaignData(campaignId: string): void {
    const dir = path.join(this.audishDir, campaignId);
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err) {
      logError(`StorageManager.deleteCampaignData(${campaignId})`, err);
      throw err;
    }
  }

  exportCampaign(campaignId: string, campaign: Campaign): object {
    return {
      version: 1,
      campaign,
      bookmarks: this.getBookmarks(campaignId),
      coverage: this.getCoverage(campaignId),
      comments: this.getComments(campaignId),
      exportedAt: new Date().toISOString()
    };
  }

  importCampaign(data: {
    campaign: Campaign;
    bookmarks: Bookmark[];
    coverage: CoverageData;
    comments: Comment[];
  }): void {
    this.saveBookmarks(data.campaign.id, data.bookmarks);
    this.saveCoverage(data.campaign.id, data.coverage);
    this.saveComments(data.campaign.id, data.comments);
  }
}
