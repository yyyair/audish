import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { CampaignManager } from './campaignManager';
import { DecorationManager } from './decorationManager';
import { CampaignTreeProvider, BookmarkTreeProvider, CommentTreeProvider } from './sidebarProvider';
import { AudishHoverProvider } from './hoverProvider';
import { AudishCodeLensProvider } from './codeLensProvider';
import { CommentEditorView } from './commentPanel';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext): void {
  if (!vscode.workspace.workspaceFolders?.length) {
    const warn = () => vscode.window.showWarningMessage('Audish requires an open workspace folder.');
    for (const cmd of [
      'audish.createCampaign', 'audish.selectCampaign', 'audish.renameCampaign',
      'audish.deleteCampaign', 'audish.addBookmark', 'audish.deleteBookmark',
      'audish.markLineSeen', 'audish.unmarkLineSeen', 'audish.addComment',
      'audish.editComment', 'audish.deleteComment', 'audish.exportCampaign',
      'audish.importCampaign'
    ]) {
      context.subscriptions.push(vscode.commands.registerCommand(cmd, warn));
    }
    return;
  }

  const storage = new StorageManager();
  const manager = new CampaignManager(storage);

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'audish.selectCampaign';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Sidebar tree views
  const campaignProvider = new CampaignTreeProvider(manager);
  const bookmarkProvider = new BookmarkTreeProvider(manager, storage);
  const commentProvider  = new CommentTreeProvider(manager, storage);

  const campaignsView = vscode.window.createTreeView('audish.campaigns', {
    treeDataProvider: campaignProvider,
    showCollapseAll: false
  });
  const bookmarksView = vscode.window.createTreeView('audish.bookmarks', {
    treeDataProvider: bookmarkProvider,
    showCollapseAll: true
  });
  const commentsView = vscode.window.createTreeView('audish.comments', {
    treeDataProvider: commentProvider,
    showCollapseAll: true
  });

  function updateViewMessages(): void {
    campaignsView.message = manager.getCampaigns().length === 0
      ? 'No campaigns yet. Click + to create one.' : undefined;
    bookmarksView.message = !manager.getActiveCampaignId()
      ? 'Select a campaign first.'
      : manager.getBookmarks().length === 0
        ? 'No bookmarks. Press Ctrl+Alt+B in the editor.' : undefined;
    commentsView.message = !manager.getActiveCampaignId()
      ? 'Select a campaign first.'
      : manager.getComments().length === 0
        ? 'No comments. Press Ctrl+Alt+C in the editor.' : undefined;
  }

  manager.onDidChange(updateViewMessages);
  updateViewMessages();
  context.subscriptions.push(campaignsView, bookmarksView, commentsView);

  // Bottom-panel comment editor (WebviewViewProvider)
  const commentEditorView = new CommentEditorView(storage, manager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CommentEditorView.viewId,
      commentEditorView,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Keep the comment pane in sync with the active cursor position.
  function syncCommentPane(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.uri.scheme !== 'file') {
      commentEditorView.update('', -1);
    } else {
      commentEditorView.update(
        storage.toRelativePath(editor.document.uri.fsPath),
        editor.selection.active.line
      );
    }
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(syncCommentPane),
    vscode.window.onDidChangeTextEditorSelection(e => {
      if (e.textEditor === vscode.window.activeTextEditor) syncCommentPane(e.textEditor);
    })
  );
  syncCommentPane(vscode.window.activeTextEditor);

  // Decorations
  const decorationManager = new DecorationManager(manager, storage);
  context.subscriptions.push(decorationManager);

  // Hover provider (shows full comment text on mouseover)
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: 'file' }, new AudishHoverProvider(manager, storage))
  );

  // CodeLens provider (comment preview + clickable links + Edit/Delete above each commented line)
  const codeLensProvider = new AudishCodeLensProvider(manager, storage);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
    codeLensProvider
  );

  // Commands
  registerCommands(context, manager, storage, statusBar, commentEditorView, decorationManager, codeLensProvider);
}

export function deactivate(): void {}
