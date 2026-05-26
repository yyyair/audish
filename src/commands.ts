import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Bookmark, Comment } from './models';
import { CampaignManager } from './campaignManager';
import { StorageManager } from './storageManager';
import { CampaignItem, BookmarkItem, CommentItem } from './sidebarProvider';
import { CommentEditorView } from './commentPanel';
import { DecorationManager } from './decorationManager';
import { AudishCodeLensProvider } from './codeLensProvider';

function requireActiveCampaign(manager: CampaignManager): boolean {
  if (manager.getActiveCampaignId()) return true;
  vscode.window.showWarningMessage(
    'No active Audish campaign. Create or select one first.',
    'Create Campaign'
  ).then(c => c && vscode.commands.executeCommand('audish.createCampaign'));
  return false;
}

function editorContext(): { editor: vscode.TextEditor; lines: number[] } | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showWarningMessage('No active editor.'); return undefined; }
  const { selection: sel } = editor;
  const lines: number[] = [];
  for (let i = sel.start.line; i <= sel.end.line; i++) lines.push(i);
  return { editor, lines };
}

async function navigateTo(storage: StorageManager, file: string, line: number): Promise<void> {
  const uri = vscode.Uri.file(storage.toAbsolutePath(file));
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const pos = new vscode.Position(Math.min(line, doc.lineCount - 1), 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  manager: CampaignManager,
  storage: StorageManager,
  statusBar: vscode.StatusBarItem,
  commentEditor: CommentEditorView,
  decorationManager: DecorationManager,
  codeLensProvider: AudishCodeLensProvider
): void {

  function refreshStatusBar(): void {
    const c = manager.getActiveCampaign();
    statusBar.text = c ? `$(shield) ${c.name}` : '$(shield) No Campaign';
    statusBar.tooltip = c
      ? `Active campaign: ${c.name}${c.description ? '\n' + c.description : ''}\nClick to switch`
      : 'Click to create or select an Audish campaign';
  }
  manager.onDidChange(refreshStatusBar);
  refreshStatusBar();

  // -------------------------------------------------------------------------
  // Campaigns
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('audish.createCampaign', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Campaign name',
        placeHolder: 'e.g. Understanding DB Flow',
        validateInput: v => v.trim() ? null : 'Name is required'
      });
      if (!name) return;
      const desc = await vscode.window.showInputBox({
        prompt: 'Description (optional)',
        placeHolder: 'Brief goal of this campaign'
      });
      manager.createCampaign(name.trim(), desc?.trim() ?? '');
      vscode.window.showInformationMessage(`Campaign "${name.trim()}" created.`);
    }),

    vscode.commands.registerCommand('audish.selectCampaign', async (idOrItem?: string | CampaignItem) => {
      if (typeof idOrItem === 'string') { manager.setActiveCampaign(idOrItem); return; }
      if (idOrItem instanceof CampaignItem) { manager.setActiveCampaign(idOrItem.campaign.id); return; }
      const campaigns = manager.getCampaigns();
      if (!campaigns.length) {
        vscode.window.showWarningMessage('No campaigns yet.', 'Create Campaign')
          .then(c => c && vscode.commands.executeCommand('audish.createCampaign'));
        return;
      }
      const activeId = manager.getActiveCampaignId();
      const picked = await vscode.window.showQuickPick(
        campaigns.map(c => ({
          label: c.name,
          description: c.id === activeId ? '(active)' : c.description,
          id: c.id
        })),
        { placeHolder: 'Select active campaign' }
      );
      if (picked) manager.setActiveCampaign(picked.id);
    }),

    vscode.commands.registerCommand('audish.renameCampaign', async (item?: CampaignItem) => {
      const campaign = item?.campaign ?? manager.getActiveCampaign();
      if (!campaign) return;
      const name = await vscode.window.showInputBox({
        prompt: 'New campaign name',
        value: campaign.name,
        validateInput: v => v.trim() ? null : 'Name is required'
      });
      if (name) manager.renameCampaign(campaign.id, name.trim());
    }),

    vscode.commands.registerCommand('audish.deleteCampaign', async (item?: CampaignItem) => {
      const campaign = item?.campaign ?? manager.getActiveCampaign();
      if (!campaign) return;
      const ok = await vscode.window.showWarningMessage(
        `Delete campaign "${campaign.name}" and all its data? This cannot be undone.`,
        { modal: true }, 'Delete'
      );
      if (ok === 'Delete') {
        manager.deleteCampaign(campaign.id);
        vscode.window.showInformationMessage(`Campaign "${campaign.name}" deleted.`);
      }
    }),

    // -------------------------------------------------------------------------
    // Bookmarks
    // -------------------------------------------------------------------------
    vscode.commands.registerCommand('audish.addBookmark', async () => {
      if (!requireActiveCampaign(manager)) return;
      const ctx = editorContext();
      if (!ctx) return;
      const line = ctx.lines[0];
      const file = storage.toRelativePath(ctx.editor.document.uri.fsPath);
      const desc = await vscode.window.showInputBox({
        prompt: `Bookmark line ${line + 1} in ${path.basename(file)}`,
        placeHolder: 'Short description (optional)'
      });
      if (desc === undefined) return;
      manager.addBookmark(file, line, desc.trim());
    }),

    vscode.commands.registerCommand('audish.deleteBookmark', (item?: BookmarkItem) => {
      if (item?.bookmark) manager.deleteBookmark(item.bookmark.id);
    }),

    vscode.commands.registerCommand('audish.goToBookmark', (bookmark: Bookmark) =>
      navigateTo(storage, bookmark.file, bookmark.line)
    ),

    // -------------------------------------------------------------------------
    // Coverage
    // -------------------------------------------------------------------------
    vscode.commands.registerCommand('audish.markLineSeen', () => {
      if (!requireActiveCampaign(manager)) return;
      const ctx = editorContext();
      if (!ctx) return;
      manager.markLinesSeen(storage.toRelativePath(ctx.editor.document.uri.fsPath), ctx.lines);
    }),

    vscode.commands.registerCommand('audish.unmarkLineSeen', () => {
      if (!requireActiveCampaign(manager)) return;
      const ctx = editorContext();
      if (!ctx) return;
      manager.unmarkLinesSeen(storage.toRelativePath(ctx.editor.document.uri.fsPath), ctx.lines);
    }),

    // -------------------------------------------------------------------------
    // Comments
    // -------------------------------------------------------------------------
    vscode.commands.registerCommand('audish.addComment', async () => {
      if (!requireActiveCampaign(manager)) return;
      await commentEditor.focus();
    }),

    vscode.commands.registerCommand('audish.editComment', async (item?: CommentItem) => {
      if (!item?.comment) return;
      await navigateTo(storage, item.comment.file, item.comment.line);
      commentEditor.forceUpdate(item.comment.file, item.comment.line);
      await commentEditor.focus();
    }),

    vscode.commands.registerCommand('audish.editCommentById', async (commentId: string) => {
      const comment = manager.getComments().find(c => c.id === commentId);
      if (!comment) return;
      await navigateTo(storage, comment.file, comment.line);
      commentEditor.forceUpdate(comment.file, comment.line);
      await commentEditor.focus();
    }),

    vscode.commands.registerCommand('audish.deleteComment', async (item?: CommentItem) => {
      if (item?.comment) await confirmDelete(manager, item.comment);
    }),

    vscode.commands.registerCommand('audish.deleteCommentById', async (commentId: string) => {
      const comment = manager.getComments().find(c => c.id === commentId);
      if (comment) await confirmDelete(manager, comment);
    }),

    vscode.commands.registerCommand('audish.goToComment', (comment: Comment) =>
      navigateTo(storage, comment.file, comment.line)
    ),

    vscode.commands.registerCommand('audish.goToLocation', async (args: { file: string; line: number } | { symbolQuery: string }) => {
      if ('symbolQuery' in args) {
        let symbols: vscode.SymbolInformation[] | undefined;
        try {
          symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider', args.symbolQuery
          );
        } catch { /* no provider */ }
        if (!symbols?.length) {
          vscode.window.showWarningMessage(`Audish: no symbol found for @#${args.symbolQuery}`);
          return;
        }
        let chosen: vscode.SymbolInformation;
        if (symbols.length === 1) {
          chosen = symbols[0];
        } else {
          const picked = await vscode.window.showQuickPick(
            symbols.map(s => ({
              label: s.name,
              description: s.containerName,
              detail: `${vscode.workspace.asRelativePath(s.location.uri)}:${s.location.range.start.line + 1}`,
              symbol: s
            })),
            { placeHolder: `Multiple matches for @#${args.symbolQuery} — pick one` }
          );
          if (!picked) return;
          chosen = picked.symbol;
        }
        await navigateTo(storage, storage.toRelativePath(chosen.location.uri.fsPath), chosen.location.range.start.line);
      } else {
        await navigateTo(storage, args.file, args.line);
      }
    }),

    // -------------------------------------------------------------------------
    // View toggles
    // -------------------------------------------------------------------------
    vscode.commands.registerCommand('audish.toggleDecorations', () => {
      decorationManager.toggle();
      codeLensProvider.toggle();
      const state = decorationManager.visible ? 'on' : 'off';
      vscode.window.showInformationMessage(`Audish markup: ${state}`);
    }),

    vscode.commands.registerCommand('audish.toggleCommentMode', (() => {
      let mode: 'codelens' | 'inline' = 'codelens';
      return () => {
        mode = mode === 'codelens' ? 'inline' : 'codelens';
        decorationManager.setCommentMode(mode);
        codeLensProvider.setCommentMode(mode);
        vscode.window.showInformationMessage(`Audish comment display: ${mode}`);
      };
    })()),

    vscode.commands.registerCommand('audish.showCoverageStats', async () => {
      if (!requireActiveCampaign(manager)) return;
      const coverage = manager.getCoverage();
      const files = Object.entries(coverage).filter(([, lines]) => lines.length > 0);
      if (!files.length) {
        vscode.window.showInformationMessage('No coverage data in the active campaign.');
        return;
      }
      const items = files
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, lines]) => {
          let total = 0;
          try {
            const content = fs.readFileSync(storage.toAbsolutePath(file), 'utf-8');
            total = content.split('\n').length;
          } catch { /* file may not exist */ }
          const pct = total > 0 ? ` (${Math.round(lines.length / total * 100)}%)` : '';
          return { label: file, description: `${lines.length}${total > 0 ? ` / ${total}` : ''} lines${pct}`, file };
        });
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Coverage — ${manager.getActiveCampaign()?.name} — select a file to open it`
      });
      if (picked) await navigateTo(storage, picked.file, 0);
    }),

    // -------------------------------------------------------------------------
    // Export / Import
    // -------------------------------------------------------------------------
    vscode.commands.registerCommand('audish.exportCampaign', async () => {
      const campaign = manager.getActiveCampaign();
      if (!campaign) { vscode.window.showWarningMessage('No active campaign to export.'); return; }
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`audish-${campaign.name.replace(/\s+/g, '-')}.json`),
        filters: { 'JSON': ['json'] }
      });
      if (!uri) return;
      fs.writeFileSync(uri.fsPath, JSON.stringify(storage.exportCampaign(campaign.id, campaign), null, 2), 'utf-8');
      vscode.window.showInformationMessage(`Exported to ${path.basename(uri.fsPath)}`);
    }),

    vscode.commands.registerCommand('audish.importCampaign', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON': ['json'] },
        openLabel: 'Import Campaign'
      });
      if (!uris?.length) return;
      try {
        const raw = JSON.parse(fs.readFileSync(uris[0].fsPath, 'utf-8'));
        if (!raw.campaign || !raw.bookmarks || !raw.coverage || !raw.comments) {
          throw new Error('Invalid Audish export file');
        }
        const exists = manager.getCampaigns().find(c => c.id === raw.campaign.id);
        if (exists) {
          const choice = await vscode.window.showWarningMessage(
            `Campaign "${raw.campaign.name}" already exists. Overwrite its data?`,
            { modal: true }, 'Overwrite', 'Import as New'
          );
          if (!choice) return;
          if (choice === 'Import as New') {
            raw.campaign.id = Date.now().toString(36) + Math.random().toString(36).slice(2);
          }
        }
        const data = storage.getCampaignData();
        if (!data.campaigns.find(c => c.id === raw.campaign.id)) {
          data.campaigns.push(raw.campaign);
          storage.saveCampaignData(data);
        }
        storage.importCampaign(raw);
        manager.setActiveCampaign(raw.campaign.id);
        vscode.window.showInformationMessage(`Campaign "${raw.campaign.name}" imported.`);
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );
}

// ---------------------------------------------------------------------------

async function confirmDelete(manager: CampaignManager, comment: Comment): Promise<void> {
  const ok = await vscode.window.showWarningMessage(
    'Delete this comment?', { modal: true }, 'Delete'
  );
  if (ok === 'Delete') manager.deleteComment(comment.id);
}
