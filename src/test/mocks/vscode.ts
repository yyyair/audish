export class EventEmitter<T = void> {
  private _listeners: Array<(e: T) => any> = [];

  readonly event = (listener: (e: T) => any): { dispose(): void } => {
    this._listeners.push(listener);
    return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
  };

  fire(data: T): void { this._listeners.forEach(l => l(data)); }
  dispose(): void { this._listeners = []; }
}

export const window = {
  showWarningMessage: jest.fn().mockResolvedValue(undefined),
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showErrorMessage: jest.fn().mockResolvedValue(undefined),
  createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() })),
  activeTextEditor: undefined as any,
  createWebviewPanel: jest.fn(),
};

export const commands = {
  executeCommand: jest.fn().mockResolvedValue(undefined),
};

export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/workspace' }, name: 'test', index: 0 }],
  findFiles: jest.fn().mockResolvedValue([]),
  asRelativePath: jest.fn((p: any) => String(p)),
};

export class Uri {
  static file(path: string) { return { fsPath: path, scheme: 'file' }; }
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}
