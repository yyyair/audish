import * as vscode from 'vscode';

export const outputChannel = vscode.window.createOutputChannel('Audish');

export function log(context: string, msg: string): void {
  outputChannel.appendLine(`[${ts()}] [${context}] ${msg}`);
}

export function logError(context: string, err: unknown): void {
  const detail = err instanceof Error
    ? `${err.message}\n${err.stack ?? '(no stack)'}`
    : String(err);
  outputChannel.appendLine(`[${ts()}] [ERROR] [${context}] ${detail}`);
}

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}
