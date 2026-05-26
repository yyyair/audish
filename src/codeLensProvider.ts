import * as vscode from 'vscode';
import { CampaignManager } from './campaignManager';
import { StorageManager } from './storageManager';

export type CommentMode = 'codelens' | 'inline';

export class AudishCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  private readonly _disposables: vscode.Disposable[] = [];
  private _visible = true;
  private _commentMode: CommentMode = 'inline';

  constructor(
    private readonly manager: CampaignManager,
    private readonly storage: StorageManager
  ) {
    this._disposables.push(
      manager.onDidChange(() => this._onDidChangeCodeLenses.fire())
    );
  }

  toggle(): void {
    this._visible = !this._visible;
    this._onDidChangeCodeLenses.fire();
  }

  get visible(): boolean { return this._visible; }

  setCommentMode(mode: CommentMode): void {
    this._commentMode = mode;
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this._visible || this._commentMode !== 'codelens') return [];
    if (document.uri.scheme !== 'file') return [];
    const rel = this.storage.toRelativePath(document.uri.fsPath);
    const lenses: vscode.CodeLens[] = [];

    for (const comment of this.manager.getCommentsForFile(rel)) {
      const line = Math.min(comment.line, document.lineCount - 1);
      const range = new vscode.Range(line, 0, line, 0);

      // Comment preview as first item — clicking opens edit
      const preview = comment.text.length > 50 ? comment.text.slice(0, 50) + '…' : comment.text;
      lenses.push(new vscode.CodeLens(range, {
        title: `${preview}`,
        command: 'audish.editCommentById',
        arguments: [comment.id]
      }));

      for (const link of comment.links) {
        const payload = link.symbolQuery
          ? { symbolQuery: link.symbolQuery }
          : { file: link.file, line: link.line };
        lenses.push(new vscode.CodeLens(range, {
          title: link.label,
          command: 'audish.goToLocation',
          arguments: [payload]
        }));
      }

      lenses.push(new vscode.CodeLens(range, {
        title: '$(edit) Edit',
        command: 'audish.editCommentById',
        arguments: [comment.id]
      }));

      lenses.push(new vscode.CodeLens(range, {
        title: '$(trash) Delete',
        command: 'audish.deleteCommentById',
        arguments: [comment.id]
      }));
    }

    return lenses;
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
    this._disposables.forEach(d => d.dispose());
  }
}
