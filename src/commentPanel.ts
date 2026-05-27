import * as vscode from 'vscode';
import { CodeLink } from './models';
import { StorageManager } from './storageManager';
import { CampaignManager } from './campaignManager';
import { parseRefs, resolveRefs } from './linkResolver';
import { logError } from './logger';

export class CommentEditorView implements vscode.WebviewViewProvider {
  static readonly viewId = 'audish.commentEditor';

  private _view?: vscode.WebviewView;
  private readonly _ready: Promise<void>;
  private _resolveReady!: () => void;

  private _currentFile = '';
  private _currentLine = -1;
  private _currentCommentId: string | undefined;
  private _saving = false;
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly storage: StorageManager,
    private readonly manager: CampaignManager
  ) {
    this._ready = new Promise(r => { this._resolveReady = r; });
  }

  resolveWebviewView(
    view: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = view;
    this._resolveReady();

    view.webview.options = { enableScripts: true };
    this._renderCurrentState();

    // React when a comment is deleted or edited externally (CodeLens, sidebar).
    this.manager.onDidChange(() => {
      if (!this._currentCommentId) return;
      const stillExists = this.manager.getComments().some(c => c.id === this._currentCommentId);
      if (!stillExists) {
        this._currentCommentId = undefined;
        this._renderCurrentState();
      }
    });

    view.webview.onDidReceiveMessage(async (msg: {
      type: string; text?: string; query?: string; forSymbol?: boolean;
    }) => {
      // ── completions ──────────────────────────────────────────────────────
      if (msg.type === 'requestCompletions') {
        const query = msg.query ?? '';
        try {
          if (msg.forSymbol) {
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
              'vscode.executeWorkspaceSymbolProvider', query
            ) ?? [];
            view.webview.postMessage({
              type: 'completions',
              items: symbols.slice(0, 10).map(s => ({
                insert: '#' + s.name,
                label: s.name,
                detail: vscode.workspace.asRelativePath(s.location.uri)
              }))
            });
          } else {
            const glob = query.includes('/') || query.includes('.')
              ? `**/${query}*`
              : `**/*${query}*`;
            const uris = await vscode.workspace.findFiles(glob, '{**/node_modules/**,**/.git/**}', 10);
            view.webview.postMessage({
              type: 'completions',
              items: uris.map(u => {
                const rel = this.storage.toRelativePath(u.fsPath);
                return { insert: rel, label: rel, detail: '' };
              })
            });
          }
        } catch { /* no provider */ }
        return;
      }

      // ── save ─────────────────────────────────────────────────────────────
      if (msg.type === 'save') {
        if (this._saving) return;
        this._saving = true;
        const text = (msg.text ?? '').trim();

        if (!text) {
          this._saving = false;
          this._renderCurrentState(); // reset
          return;
        }

        if (!this.manager.getActiveCampaignId()) {
          this._saving = false;
          vscode.window.showWarningMessage(
            'No active Audish campaign. Create or select one first.',
            'Create Campaign'
          ).then(c => c && vscode.commands.executeCommand('audish.createCampaign'));
          return;
        }

        let links: CodeLink[] = [];
        try {
          links = await resolveRefs(parseRefs(text), this.storage);
        } catch (err) {
          logError('CommentEditorView.save', err);
          vscode.window.showWarningMessage(
            'Audish: link resolution failed — comment saved without links. See Output > Audish.'
          );
        }

        try {
          if (this._currentCommentId) {
            this.manager.editComment(this._currentCommentId, text, links);
          } else if (this._currentFile) {
            this.manager.addComment(this._currentFile, this._currentLine, text, links);
            // Capture the newly created comment's id for subsequent saves
            const created = this.manager
              .getCommentsForFile(this._currentFile)
              .find(c => c.line === this._currentLine);
            this._currentCommentId = created?.id;
          }
        } catch (err) {
          logError('CommentEditorView.manager', err);
        }

        this._saving = false;
        void vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        return;
      }

      // ── cancel ───────────────────────────────────────────────────────────
      if (msg.type === 'cancel') {
        this._renderCurrentState();
        void vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      }
    });
  }

  // Called on every cursor/editor change — debounced so rapid movement is cheap.
  update(file: string, line: number): void {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._applyUpdate(file, line), 150);
  }

  // Bypasses debounce and position-equality check — used for explicit navigation.
  forceUpdate(file: string, line: number): void {
    clearTimeout(this._debounceTimer);
    this._currentFile = file;
    this._currentLine = line;
    this._renderCurrentState();
  }

  private _applyUpdate(file: string, line: number): void {
    if (file === this._currentFile && line === this._currentLine) return;
    this._currentFile = file;
    this._currentLine = line;
    this._renderCurrentState();
  }

  // Reveals the panel and focuses the textarea so the user can type immediately.
  async focus(): Promise<void> {
    await vscode.commands.executeCommand(`${CommentEditorView.viewId}.focus`);
    await this._ready;
    // Re-render with autofocus so the textarea is focused as part of the HTML
    // load itself, avoiding a postMessage race against webview initialization.
    this._renderCurrentState(true);
  }

  private _renderCurrentState(autofocus = false): void {
    if (!this._view) return;
    const comment = this._currentFile
      ? this.manager.getCommentsForFile(this._currentFile).find(c => c.line === this._currentLine)
      : undefined;
    this._currentCommentId = comment?.id;
    this._view.webview.html = buildHtml(this._currentFile, this._currentLine, comment?.text ?? '', autofocus);
  }
}

// ---------------------------------------------------------------------------

function buildHtml(file: string, line: number, initialText: string, autofocus = false): string {
  const nonce = randomNonce();
  const isEmpty = !file;

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 10px 12px 8px;
  gap: 8px;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family, sans-serif);
  font-size: var(--vscode-font-size, 13px);
}
.idle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.4;
  font-style: italic;
}
.location {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
  opacity: 0.55;
}
textarea {
  flex: 1;
  width: 100%;
  min-height: 60px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, #555);
  border-radius: 3px;
  padding: 7px 9px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: var(--vscode-editor-font-size, 13px);
  line-height: 1.5;
  resize: none;
  outline: none;
}
textarea:focus { border-color: var(--vscode-focusBorder); }
textarea::placeholder { opacity: 0.4; font-style: italic; }
.hint { font-size: 11px; opacity: 0.45; }
.hint code {
  font-family: var(--vscode-editor-font-family, monospace);
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 1px 4px; border-radius: 3px;
}
#refs { display: flex; flex-direction: column; gap: 3px; min-height: 0; }
.ref {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px;
  font-family: var(--vscode-editor-font-family, monospace);
}
.ref-raw  { color: var(--vscode-textLink-foreground); }
.ref-sep  { opacity: 0.35; }
.ref-desc { opacity: 0.65; }
#completions {
  display: none;
  flex-direction: column;
  max-height: 150px;
  overflow-y: auto;
  background: var(--vscode-dropdown-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-focusBorder, #555);
  border-radius: 3px;
  flex-shrink: 0;
}
.comp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  cursor: pointer;
  gap: 8px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
}
.comp-item:hover, .comp-item.comp-active { background: var(--vscode-list-hoverBackground); }
.comp-label { color: var(--vscode-textLink-foreground); flex-shrink: 0; }
.comp-detail { opacity: 0.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions {
  display: flex; gap: 6px; align-items: center;
  justify-content: flex-end; flex-shrink: 0;
}
.shortcut { font-size: 11px; opacity: 0.38; margin-right: auto; }
button {
  padding: 4px 14px; border: none; border-radius: 3px;
  font-size: 12px; cursor: pointer;
}
#btn-save {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}
#btn-save:hover { background: var(--vscode-button-hoverBackground); }
#btn-cancel {
  background: transparent;
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-input-border, #555);
}
#btn-cancel:hover { opacity: 0.7; }
</style>
</head>
<body>

${isEmpty ? /* html */`<div class="idle">Move cursor to any line to view or add a comment</div>` : /* html */`
  <div class="location">${esc(file)} &nbsp;·&nbsp; line ${line + 1}</div>

  <textarea id="ta" spellcheck="true"
    placeholder="Enter comment…&#10;&#10;Links: @filename  @file.ts:42  @#symbol"
    ${autofocus ? 'autofocus' : ''}>${esc(initialText)}</textarea>

  <div class="hint">
    Links: <code>@file</code> &nbsp;·&nbsp; <code>@file:42</code> &nbsp;·&nbsp; <code>@#symbol</code>
  </div>

  <div id="refs"></div>

  <div id="completions"></div>

  <div class="actions">
    <span class="shortcut">Ctrl+Enter to save &nbsp;·&nbsp; Esc to reset</span>
    <button id="btn-cancel">Reset</button>
    <button id="btn-save">Save</button>
  </div>

  <script nonce="${nonce}">
    (function () {
      const vsc    = acquireVsCodeApi();
      const ta     = document.getElementById('ta');
      const refsEl = document.getElementById('refs');
      const compEl = document.getElementById('completions');

      // ── ref preview ──────────────────────────────────────────────────────
      const RE = /@(#?)([^\\s@:,;!?'"()\\[\\]{}]+)(?::(\\d+))?/g;

      function parseRefs(text) {
        var out = [], m;
        RE.lastIndex = 0;
        while ((m = RE.exec(text)) !== null) {
          var isSymbol = m[1] === '#';
          var name = m[2];
          var ln = m[3] !== undefined ? parseInt(m[3], 10) : undefined;
          var desc = isSymbol ? 'symbol: ' + name
            : ln !== undefined ? 'file: ' + name + ' · line ' + ln
            : 'file: ' + name;
          out.push({ raw: m[0], desc: desc });
        }
        return out;
      }

      function render() {
        var refs = parseRefs(ta.value);
        if (!refs.length) { refsEl.innerHTML = ''; return; }
        refsEl.innerHTML = refs.map(function(r) {
          return '<div class="ref"><span class="ref-raw">' + escHtml(r.raw)
            + '</span><span class="ref-sep">→</span><span class="ref-desc">'
            + escHtml(r.desc) + '</span></div>';
        }).join('');
      }

      function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }

      // ── autocomplete ─────────────────────────────────────────────────────
      var compItems  = [];
      var compIndex  = -1;
      var atTokenPos = -1;
      var debounce   = null;

      function getAtToken() {
        var cursor = ta.selectionStart;
        var before = ta.value.slice(0, cursor);
        var atIdx  = before.lastIndexOf('@');
        if (atIdx === -1) return null;
        var partial = before.slice(atIdx + 1);
        if (/[\\s@,;!?()\\[\\]{}]/.test(partial)) return null;
        var prev = atIdx > 0 ? before[atIdx - 1] : '';
        if (prev && !/[\\s,;!?()\\[\\]{}]/.test(prev)) return null;
        var forSymbol = partial.charAt(0) === '#';
        var query = forSymbol ? partial.slice(1) : partial.split(':')[0];
        return { atIdx: atIdx, forSymbol: forSymbol, query: query };
      }

      function renderCompletions() {
        if (!compItems.length) { hideCompletions(); return; }
        compEl.style.display = 'flex';
        compEl.innerHTML = compItems.map(function(item, i) {
          var active = i === compIndex ? ' comp-active' : '';
          return '<div class="comp-item' + active + '" data-i="' + i + '">'
            + '<span class="comp-label">' + escHtml(item.label) + '</span>'
            + (item.detail ? '<span class="comp-detail">' + escHtml(item.detail) + '</span>' : '')
            + '</div>';
        }).join('');
      }

      function hideCompletions() {
        compEl.style.display = 'none';
        compItems = [];
        compIndex = -1;
      }

      function applyCompletion(item) {
        var before = ta.value.slice(0, atTokenPos);
        var after  = ta.value.slice(ta.selectionStart);
        var insert = '@' + item.insert;
        ta.value   = before + insert + after;
        var pos    = before.length + insert.length;
        ta.setSelectionRange(pos, pos);
        hideCompletions();
        render();
        ta.focus();
      }

      compEl.addEventListener('mousedown', function(e) {
        e.preventDefault();
        var el = e.target.closest('.comp-item');
        if (!el) return;
        applyCompletion(compItems[parseInt(el.dataset.i, 10)]);
      });

      window.addEventListener('message', function(event) {
        if (event.data.type === 'completions') {
          compItems = event.data.items || [];
          compIndex = -1;
          renderCompletions();
        }
      });

      ta.addEventListener('input', function() {
        render();
        var token = getAtToken();
        if (!token) { hideCompletions(); return; }
        atTokenPos = token.atIdx;
        clearTimeout(debounce);
        debounce = setTimeout(function() {
          vsc.postMessage({ type: 'requestCompletions', query: token.query, forSymbol: token.forSymbol });
        }, 120);
      });

      // ── keyboard ─────────────────────────────────────────────────────────
      function save() { vsc.postMessage({ type: 'save', text: ta.value }); }

      ta.addEventListener('keydown', function(e) {
        if (compItems.length) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            compIndex = Math.min(compIndex + 1, compItems.length - 1);
            renderCompletions(); return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            compIndex = Math.max(compIndex - 1, 0);
            renderCompletions(); return;
          }
          if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)) {
            var target = compIndex >= 0 ? compItems[compIndex] : compItems[0];
            if (target) { e.preventDefault(); applyCompletion(target); return; }
          }
          if (e.key === 'Escape') {
            hideCompletions();
            e.stopPropagation();
            return;
          }
        }
      });

      document.getElementById('btn-save').addEventListener('click', save);
      document.getElementById('btn-cancel').addEventListener('click', function() {
        vsc.postMessage({ type: 'cancel' });
      });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { vsc.postMessage({ type: 'cancel' }); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
      });

      // ── init ─────────────────────────────────────────────────────────────
      render();
      ${autofocus ? 'requestAnimationFrame(function(){ta.focus();});' : ''}
    })();
  </script>
`}

</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function randomNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
