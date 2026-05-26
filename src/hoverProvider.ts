import * as vscode from 'vscode';
import { CampaignManager } from './campaignManager';
import { StorageManager } from './storageManager';
import { logError } from './logger';

export class AudishHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly manager: CampaignManager,
    private readonly storage: StorageManager
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    try {
      return this._provideHover(document, position);
    } catch (err) {
      logError('HoverProvider.provideHover', err);
      return undefined;
    }
  }

  private _provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    if (document.uri.scheme !== 'file') return;

    const rel = this.storage.toRelativePath(document.uri.fsPath);
    const comments = this.manager.getCommentsForFile(rel).filter(c => c.line === position.line);

    if (comments.length === 0) return;

    const sections: vscode.MarkdownString[] = [];

    for (const comment of comments) {
      const md = new vscode.MarkdownString(undefined, true);
      md.isTrusted = true;
      md.supportHtml = false;

      md.appendMarkdown(`**Audish** — *${new Date(comment.updatedAt).toLocaleDateString()}*\n\n`);
      md.appendText(comment.text);

      if (comment.links.length > 0) {
        md.appendMarkdown('\n\n**Links:**\n');
        for (const link of comment.links) {
          const payload = link.symbolQuery
            ? { symbolQuery: link.symbolQuery }
            : { file: link.file, line: link.line };
          const args = encodeURIComponent(JSON.stringify(payload));
          const href = `command:audish.goToLocation?${args}`;
          const label = link.label || (link.symbolQuery ? link.symbolQuery : `${link.file}:${link.line + 1}`);
          md.appendMarkdown(`- [${label}](${href})\n`);
        }
      }

      sections.push(md);
    }

    return new vscode.Hover(sections, document.lineAt(position.line).range);
  }
}
