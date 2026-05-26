import * as vscode from 'vscode';
import * as path from 'path';
import { Campaign, Bookmark, Comment } from './models';
import { CampaignManager } from './campaignManager';
import { StorageManager } from './storageManager';

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export class CampaignTreeProvider implements vscode.TreeDataProvider<CampaignItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly manager: CampaignManager) {
    manager.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(el: CampaignItem): vscode.TreeItem { return el; }

  getChildren(): CampaignItem[] {
    const campaigns = this.manager.getCampaigns();
    const activeId = this.manager.getActiveCampaignId();
    return campaigns.map(c => new CampaignItem(c, c.id === activeId));
  }
}

export class CampaignItem extends vscode.TreeItem {
  constructor(public readonly campaign: Campaign, public readonly isActive: boolean) {
    super(campaign.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = isActive ? 'campaign-active' : 'campaign-inactive';
    this.description = isActive ? '(active)' : (campaign.description || '');
    this.tooltip = campaign.description || campaign.name;
    this.iconPath = new vscode.ThemeIcon(
      isActive ? 'circle-filled' : 'circle-outline',
      isActive ? new vscode.ThemeColor('charts.green') : undefined
    );
    if (!isActive) {
      this.command = {
        command: 'audish.selectCampaign',
        title: 'Set as Active',
        arguments: [campaign.id]
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

type BookmarkTreeNode = BookmarkFileItem | BookmarkItem;

export class BookmarkTreeProvider implements vscode.TreeDataProvider<BookmarkTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly manager: CampaignManager,
    private readonly storage: StorageManager
  ) {
    manager.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(el: BookmarkTreeNode): vscode.TreeItem { return el; }

  getChildren(el?: BookmarkTreeNode): BookmarkTreeNode[] {
    if (!el) {
      const byFile = groupBy(this.manager.getBookmarks(), b => b.file);
      return [...byFile.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, bms]) => new BookmarkFileItem(file, bms));
    }
    if (el instanceof BookmarkFileItem) {
      return el.bookmarks
        .slice()
        .sort((a, b) => a.line - b.line)
        .map(b => new BookmarkItem(b));
    }
    return [];
  }
}

export class BookmarkFileItem extends vscode.TreeItem {
  constructor(public readonly file: string, public readonly bookmarks: Bookmark[]) {
    super(path.basename(file), vscode.TreeItemCollapsibleState.Expanded);
    const dir = path.dirname(file);
    this.description = dir !== '.' ? dir : '';
    this.iconPath = vscode.ThemeIcon.File;
    this.tooltip = file;
    this.contextValue = 'bookmarkFile';
  }
}

export class BookmarkItem extends vscode.TreeItem {
  constructor(public readonly bookmark: Bookmark) {
    const label = bookmark.description
      ? `${bookmark.line + 1}: ${bookmark.description}`
      : `Line ${bookmark.line + 1}`;
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'bookmark';
    this.iconPath = new vscode.ThemeIcon('bookmark');
    this.tooltip = bookmark.description || `Line ${bookmark.line + 1}`;
    this.command = {
      command: 'audish.goToBookmark',
      title: 'Go to Bookmark',
      arguments: [bookmark]
    };
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

type CommentTreeNode = CommentFileItem | CommentItem;

export class CommentTreeProvider implements vscode.TreeDataProvider<CommentTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly manager: CampaignManager,
    private readonly storage: StorageManager
  ) {
    manager.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(el: CommentTreeNode): vscode.TreeItem { return el; }

  getChildren(el?: CommentTreeNode): CommentTreeNode[] {
    if (!el) {
      const byFile = groupBy(this.manager.getComments(), c => c.file);
      return [...byFile.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, cms]) => new CommentFileItem(file, cms));
    }
    if (el instanceof CommentFileItem) {
      return el.comments
        .slice()
        .sort((a, b) => a.line - b.line)
        .map(c => new CommentItem(c));
    }
    return [];
  }
}

export class CommentFileItem extends vscode.TreeItem {
  constructor(public readonly file: string, public readonly comments: Comment[]) {
    super(path.basename(file), vscode.TreeItemCollapsibleState.Expanded);
    const dir = path.dirname(file);
    this.description = dir !== '.' ? dir : '';
    this.iconPath = vscode.ThemeIcon.File;
    this.tooltip = file;
    this.contextValue = 'commentFile';
  }
}

export class CommentItem extends vscode.TreeItem {
  constructor(public readonly comment: Comment) {
    const preview = comment.text.length > 50
      ? comment.text.slice(0, 50) + '…'
      : comment.text;
    super(`${comment.line + 1}: ${preview}`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'comment';
    this.iconPath = new vscode.ThemeIcon('comment');
    this.tooltip = comment.text;
    this.description = comment.links.length > 0 ? `${comment.links.length} link(s)` : '';
    this.command = {
      command: 'audish.goToComment',
      title: 'Go to Comment',
      arguments: [comment]
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}
