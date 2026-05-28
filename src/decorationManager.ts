import * as vscode from 'vscode';
import { CampaignManager } from './campaignManager';
import { StorageManager } from './storageManager';
import { logError } from './logger';
import { CommentMode } from './codeLensProvider';

export class DecorationManager implements vscode.Disposable {
  private readonly coverageType: vscode.TextEditorDecorationType;
  private readonly bookmarkType: vscode.TextEditorDecorationType;
  private commentTypes = new Map<string, vscode.TextEditorDecorationType>();
  private readonly disposables: vscode.Disposable[] = [];
  private _visible = true;
  private _commentMode: CommentMode = 'inline';

  constructor(
    private readonly manager: CampaignManager,
    private readonly storage: StorageManager
  ) {
    this.coverageType = vscode.window.createTextEditorDecorationType({
      borderStyle: 'solid',
      borderWidth: '0 0 0 3px',
      borderColor: 'rgba(40, 167, 69, 0.85)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(40, 167, 69, 0.6)',
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });

    this.bookmarkType = vscode.window.createTextEditorDecorationType({
      borderStyle: 'solid',
      borderWidth: '0 0 0 3px',
      borderColor: 'rgba(255, 193, 7, 0.85)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(255, 193, 7, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Left
    });

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(e => {
        if (e) this.applyTo(e);
      }),
      vscode.window.onDidChangeVisibleTextEditors(editors => {
        editors.forEach(e => this.applyTo(e));
      }),
      manager.onDidChange(() => {
        try { this.refreshAll(); } catch (err) { logError('DecorationManager.onDidChange', err); }
      })
    );

    vscode.window.visibleTextEditors.forEach(e => this.applyTo(e));
  }

  toggle(): void {
    this._visible = !this._visible;
    if (this._visible) {
      this.refreshAll();
    } else {
      vscode.window.visibleTextEditors.forEach(e => {
        e.setDecorations(this.coverageType, []);
        e.setDecorations(this.bookmarkType, []);
      });
      this.clearCommentTypes();
    }
  }

  get visible(): boolean { return this._visible; }

  setCommentMode(mode: CommentMode): void {
    this._commentMode = mode;
    this.refreshAll();
  }

  refreshAll(): void {
    this.clearCommentTypes();
    vscode.window.visibleTextEditors.forEach(e => this.applyTo(e));
  }

  applyTo(editor: vscode.TextEditor): void {
    try {
      this._applyTo(editor);
    } catch (err) {
      logError(`DecorationManager.applyTo(${editor.document.fileName})`, err);
    }
  }

  private _applyTo(editor: vscode.TextEditor): void {
    if (editor.document.uri.scheme !== 'file') return;
    if (!this._visible) return;

    const rel = this.storage.toRelativePath(editor.document.uri.fsPath);

    // Coverage
    const coverage = this.manager.getCoverage();
    const coveredLines = coverage[rel] ?? [];
    editor.setDecorations(
      this.coverageType,
      coveredLines
        .filter(l => l < editor.document.lineCount)
        .map(l => new vscode.Range(l, 0, l, 0))
    );

    // Bookmarks
    const bookmarks = this.manager.getBookmarks().filter(b => b.file === rel);
    editor.setDecorations(
      this.bookmarkType,
      bookmarks
        .filter(b => b.line < editor.document.lineCount)
        .map(b => new vscode.Range(b.line, 0, b.line, 0))
    );

    // Comments — clear old types for this file, create new per-comment types (inline mode only)
    const oldKeys = [...this.commentTypes.keys()].filter(k => k.startsWith(rel + '\0'));
    oldKeys.forEach(k => {
      this.commentTypes.get(k)?.dispose();
      this.commentTypes.delete(k);
    });

    if (this._commentMode !== 'inline') return;

    for (const comment of this.manager.getCommentsForFile(rel)) {
      const line = Math.min(comment.line, editor.document.lineCount - 1);
      const lineLen = editor.document.lineAt(line).text.length;
      const preview = comment.text.length > 60
        ? comment.text.slice(0, 60) + '…'
        : comment.text;

      const dt = vscode.window.createTextEditorDecorationType({
        after: {
          contentText: `\t✎ ${preview}`,
          color: new vscode.ThemeColor('editorInlayHint.foreground'),
          margin: '0 0 0 4px'
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      });

      const key = `${rel}\0${comment.id}`;
      this.commentTypes.set(key, dt);
      editor.setDecorations(dt, [new vscode.Range(line, lineLen, line, lineLen)]);
    }
  }

  private clearCommentTypes(): void {
    this.commentTypes.forEach(dt => dt.dispose());
    this.commentTypes.clear();
  }

  dispose(): void {
    this.coverageType.dispose();
    this.bookmarkType.dispose();
    this.clearCommentTypes();
    this.disposables.forEach(d => d.dispose());
  }
}
