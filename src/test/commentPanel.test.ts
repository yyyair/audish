import { CommentEditorView } from '../commentPanel';
import { CampaignManager } from '../campaignManager';
import { MockStorageManager } from './mocks/storageManager';
import * as vscode from 'vscode';

// ── helpers ──────────────────────────────────────────────────────────────────

class MockWebview {
  html = '';
  options: any = {};
  private _handlers: Array<(msg: any) => any> = [];

  onDidReceiveMessage(handler: (msg: any) => any) {
    this._handlers.push(handler);
    return { dispose: jest.fn() };
  }

  postMessage(_msg: any) {}

  async send(msg: any): Promise<void> {
    await Promise.all(this._handlers.map(h => h(msg)));
  }
}

class MockWebviewPanel {
  webview = new MockWebview();
  private _disposeHandlers: Array<() => void> = [];

  onDidDispose(handler: () => void) {
    this._disposeHandlers.push(handler);
    return { dispose: jest.fn() };
  }

  reveal(_col: any, _preserveFocus?: boolean) {}

  dispose() {
    this._disposeHandlers.forEach(h => h());
  }
}

function makeMockPanel(): MockWebviewPanel {
  const panel = new MockWebviewPanel();
  (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(panel);
  return panel;
}

function setup() {
  jest.clearAllMocks();
  const storage = new MockStorageManager();
  const manager = new CampaignManager(storage as any);
  const commentView = new CommentEditorView(storage as any, manager);
  const mockPanel = makeMockPanel();
  return { manager, panel: commentView, mockPanel };
}

// ── forceUpdate ───────────────────────────────────────────────────────────────

describe('CommentEditorView.forceUpdate', () => {
  it('opens the panel and renders the comment on the target line', () => {
    const { manager, panel, mockPanel } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'hello world', []);

    panel.forceUpdate('a.ts', 5);

    expect(mockPanel.webview.html).toContain('hello world');
  });

  it('re-renders even when file and line are unchanged (regression)', () => {
    const { manager, panel, mockPanel } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'original', []);

    panel.forceUpdate('a.ts', 5);
    expect(mockPanel.webview.html).toContain('original');

    const comment = manager.getCommentsForFile('a.ts')[0];
    manager.editComment(comment.id, 'updated', []);

    panel.forceUpdate('a.ts', 5);
    expect(mockPanel.webview.html).toContain('updated');
    expect(mockPanel.webview.html).not.toContain('original');
  });

  it('does not open a panel when file is empty', () => {
    const { panel } = setup();
    panel.forceUpdate('', -1);
    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
  });
});

// ── external deletion ─────────────────────────────────────────────────────────

describe('CommentEditorView — reacting to external changes', () => {
  it('clears the pane when the displayed comment is deleted externally', () => {
    const { manager, panel, mockPanel } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'going away', []);

    panel.forceUpdate('a.ts', 5);
    expect(mockPanel.webview.html).toContain('going away');

    const comment = manager.getCommentsForFile('a.ts')[0];
    manager.deleteComment(comment.id);

    expect(mockPanel.webview.html).not.toContain('going away');
  });

  it('does not reset the pane when an unrelated comment is deleted', () => {
    const { manager, panel, mockPanel } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'keep me', []);
    const other = manager.addComment('b.ts', 1, 'delete me', []);

    panel.forceUpdate('a.ts', 5);
    manager.deleteComment(other.id);

    expect(mockPanel.webview.html).toContain('keep me');
  });
});

// ── save handler ──────────────────────────────────────────────────────────────

describe('CommentEditorView — save', () => {
  it('shows a warning and does not save when no campaign is active', async () => {
    const { manager, panel, mockPanel } = setup();
    panel.forceUpdate('a.ts', 5);

    await mockPanel.webview.send({ type: 'save', text: 'something' });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active Audish campaign'),
      'Create Campaign'
    );
    expect(manager.getComments()).toHaveLength(0);
  });

  it('creates a new comment when saving on a line with no existing comment', async () => {
    const { manager, panel, mockPanel } = setup();
    manager.createCampaign('Camp', '');
    panel.forceUpdate('a.ts', 5);

    await mockPanel.webview.send({ type: 'save', text: 'brand new' });

    const comments = manager.getCommentsForFile('a.ts');
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('brand new');
    expect(comments[0].line).toBe(5);
  });

  it('edits the existing comment when one already exists on the line', async () => {
    const { manager, panel, mockPanel } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'original', []);
    panel.forceUpdate('a.ts', 5);

    await mockPanel.webview.send({ type: 'save', text: 'revised' });

    const comments = manager.getCommentsForFile('a.ts');
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('revised');
  });

  it('reopening the panel on the same line edits rather than adds', async () => {
    const { manager, panel, mockPanel } = setup();
    manager.createCampaign('Camp', '');
    panel.forceUpdate('a.ts', 5);

    // First save — panel closes
    await mockPanel.webview.send({ type: 'save', text: 'first save' });

    // Reopen on the same line with a fresh mock
    const mockPanel2 = makeMockPanel();
    panel.forceUpdate('a.ts', 5);

    expect(mockPanel2.webview.html).toContain('first save');

    await mockPanel2.webview.send({ type: 'save', text: 'second save' });

    const comments = manager.getCommentsForFile('a.ts');
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('second save');
  });

  it('resets to saved state and keeps panel open when text is empty', async () => {
    const { manager, panel, mockPanel } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'saved text', []);
    panel.forceUpdate('a.ts', 5);

    await mockPanel.webview.send({ type: 'save', text: '' });

    expect(mockPanel.webview.html).toContain('saved text');
    expect(manager.getCommentsForFile('a.ts')[0].text).toBe('saved text');
  });

  it('dismisses the panel and returns focus to the editor after a successful save', async () => {
    const { manager, panel, mockPanel } = setup();
    manager.createCampaign('Camp', '');
    panel.forceUpdate('a.ts', 5);

    await mockPanel.webview.send({ type: 'save', text: 'done' });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.focusActiveEditorGroup'
    );
  });
});

// ── cancel handler ────────────────────────────────────────────────────────────

describe('CommentEditorView — cancel', () => {
  it('dismisses the panel and returns focus to the editor on cancel', async () => {
    const { panel, mockPanel } = setup();
    panel.forceUpdate('a.ts', 5);

    await mockPanel.webview.send({ type: 'cancel' });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.focusActiveEditorGroup'
    );
  });
});
