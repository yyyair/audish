import { CommentEditorView } from '../commentPanel';
import { CampaignManager } from '../campaignManager';
import { MockStorageManager } from './mocks/storageManager';
import * as vscode from 'vscode';

// ── helpers ──────────────────────────────────────────────────────────────────

class MockWebview {
  html = '';
  options: any = {};
  private _handlers: Array<(msg: any) => Promise<any>> = [];

  onDidReceiveMessage(handler: (msg: any) => Promise<any>) {
    this._handlers.push(handler);
    return { dispose: jest.fn() };
  }

  postMessage(_msg: any) {}

  /** Deliver a message to the extension's onDidReceiveMessage handler. */
  async send(msg: any): Promise<void> {
    await Promise.all(this._handlers.map(h => h(msg)));
  }
}

class MockWebviewView {
  webview = new MockWebview();
}

const TOKEN: any = { isCancellationRequested: false, onCancellationRequested: jest.fn() };

function setup() {
  const storage = new MockStorageManager();
  const manager = new CampaignManager(storage as any);
  const panel   = new CommentEditorView(storage as any, manager);
  const view    = new MockWebviewView();
  panel.resolveWebviewView(view as any, {} as any, TOKEN);
  return { manager, panel, view };
}

// ── forceUpdate ───────────────────────────────────────────────────────────────

describe('CommentEditorView.forceUpdate', () => {
  it('renders the comment on the target line', () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'hello world', []);

    panel.forceUpdate('a.ts', 5);

    expect(view.webview.html).toContain('hello world');
  });

  it('re-renders even when file and line are unchanged (regression)', () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'original', []);

    panel.forceUpdate('a.ts', 5);
    expect(view.webview.html).toContain('original');

    // Edit the comment externally while the pane is already showing line 5
    const comment = manager.getCommentsForFile('a.ts')[0];
    manager.editComment(comment.id, 'updated', []);

    // forceUpdate with the same position must still refresh
    panel.forceUpdate('a.ts', 5);
    expect(view.webview.html).toContain('updated');
    expect(view.webview.html).not.toContain('original');
  });

  it('shows idle state when file is empty', () => {
    const { panel, view } = setup();
    panel.forceUpdate('', -1);
    expect(view.webview.html).toContain('Move cursor');
  });
});

// ── update (debounced) ────────────────────────────────────────────────────────

describe('CommentEditorView.update', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not re-render before the debounce fires', () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'test', []);
    panel.forceUpdate('', -1);   // start on idle

    panel.update('a.ts', 5);    // debounced — not yet applied
    expect(view.webview.html).not.toContain('test');
  });

  it('re-renders after the debounce delay', () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'test', []);
    panel.forceUpdate('', -1);

    panel.update('a.ts', 5);
    jest.runAllTimers();
    expect(view.webview.html).toContain('test');
  });

  it('skips re-render when file and line have not changed', () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    panel.forceUpdate('a.ts', 5);
    const htmlBefore = view.webview.html;

    panel.update('a.ts', 5);
    jest.runAllTimers();
    expect(view.webview.html).toBe(htmlBefore);
  });
});

// ── external deletion ─────────────────────────────────────────────────────────

describe('CommentEditorView — reacting to external changes', () => {
  it('clears the pane when the displayed comment is deleted externally', () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'going away', []);

    panel.forceUpdate('a.ts', 5);
    expect(view.webview.html).toContain('going away');

    const comment = manager.getCommentsForFile('a.ts')[0];
    manager.deleteComment(comment.id);

    // onDidChange fires → panel should reset to empty state for that line
    expect(view.webview.html).not.toContain('going away');
  });

  it('does not reset the pane when an unrelated comment is deleted', () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'keep me', []);
    const other = manager.addComment('b.ts', 1, 'delete me', []);

    panel.forceUpdate('a.ts', 5);
    manager.deleteComment(other.id);

    expect(view.webview.html).toContain('keep me');
  });
});

// ── save handler ──────────────────────────────────────────────────────────────

describe('CommentEditorView — save', () => {
  it('shows a warning and does not save when no campaign is active', async () => {
    const { manager, panel, view } = setup();
    panel.forceUpdate('a.ts', 5);

    await view.webview.send({ type: 'save', text: 'something' });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active Audish campaign'),
      'Create Campaign'
    );
    expect(manager.getComments()).toHaveLength(0);
  });

  it('creates a new comment when saving on a line with no existing comment', async () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    panel.forceUpdate('a.ts', 5);

    await view.webview.send({ type: 'save', text: 'brand new' });

    const comments = manager.getCommentsForFile('a.ts');
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('brand new');
    expect(comments[0].line).toBe(5);
  });

  it('edits the existing comment when one already exists on the line', async () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'original', []);
    panel.forceUpdate('a.ts', 5);

    await view.webview.send({ type: 'save', text: 'revised' });

    const comments = manager.getCommentsForFile('a.ts');
    expect(comments).toHaveLength(1);   // no duplicate created
    expect(comments[0].text).toBe('revised');
  });

  it('subsequent saves on the same line edit rather than add', async () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    panel.forceUpdate('a.ts', 5);

    await view.webview.send({ type: 'save', text: 'first save' });
    await view.webview.send({ type: 'save', text: 'second save' });

    const comments = manager.getCommentsForFile('a.ts');
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('second save');
  });

  it('resets to saved state when text is empty', async () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'saved text', []);
    panel.forceUpdate('a.ts', 5);

    await view.webview.send({ type: 'save', text: '' });

    // pane resets to the saved comment, not lost
    expect(view.webview.html).toContain('saved text');
    expect(manager.getCommentsForFile('a.ts')[0].text).toBe('saved text');
  });
});

// ── cancel handler ────────────────────────────────────────────────────────────

describe('CommentEditorView — cancel', () => {
  it('resets the pane to the last saved state', async () => {
    const { manager, panel, view } = setup();
    manager.createCampaign('Camp', '');
    manager.addComment('a.ts', 5, 'saved', []);
    panel.forceUpdate('a.ts', 5);

    // Simulate cancel (user pressed Esc or Reset)
    await view.webview.send({ type: 'cancel' });

    expect(view.webview.html).toContain('saved');
  });
});
