import * as vscode from 'vscode';
import { CodeLink } from './models';
import { StorageManager } from './storageManager';
import { logError } from './logger';

// Matches: @file  @file:42  @file.ts:42  @src/path/file.ts  @#symbol
// Module-level regex is fine; we reset lastIndex before each use.
const REF_RE = /@(#?)([^\s@:,;!?'"()\[\]{}]+)(?::(\d+))?/g;

export interface ParsedRef {
  raw: string;
  isSymbol: boolean;
  name: string;
  line?: number;   // 0-based (converted from 1-based input)
}

export function parseRefs(text: string): ParsedRef[] {
  const refs: ParsedRef[] = [];
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(text)) !== null) {
    refs.push({
      raw: m[0],
      isSymbol: m[1] === '#',
      name: m[2],
      line: m[3] !== undefined ? parseInt(m[3]) - 1 : undefined
    });
  }
  return refs;
}

export async function resolveRefs(refs: ParsedRef[], storage: StorageManager): Promise<CodeLink[]> {
  const links: CodeLink[] = [];

  for (const ref of refs) {
    try {
      const link = await resolveOne(ref, storage);
      if (link) links.push(link);
    } catch (err) {
      logError(`resolveRefs(${ref.raw})`, err);
      vscode.window.showWarningMessage(`Audish: could not resolve ${ref.raw} — see Output > Audish for details.`);
    }
  }

  return links;
}

async function resolveOne(ref: ParsedRef, storage: StorageManager): Promise<CodeLink | undefined> {
  if (ref.isSymbol) {
    // @#symbol — workspace symbol provider
    let symbols: vscode.SymbolInformation[] | undefined;
    try {
      symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        ref.name
      );
    } catch {
      // No provider or provider threw — treat as no results
    }

    if (!symbols?.length) {
      return { file: '', line: 0, label: ref.raw, symbolQuery: ref.name };
    }

    const chosen = symbols.length === 1
      ? symbols[0]
      : await pickSymbol(symbols, ref.name);
    if (!chosen) return undefined;

    return {
      file: storage.toRelativePath(chosen.location.uri.fsPath),
      line: chosen.location.range.start.line,
      label: `${chosen.name} (${ref.raw})`
    };
  } else {
    // @file or @file:42
    const hasSlash = ref.name.includes('/');
    const hasExt   = !hasSlash && ref.name.includes('.');
    const glob     = hasSlash || hasExt ? `**/${ref.name}` : `**/${ref.name}*`;

    const uris = await vscode.workspace.findFiles(glob, '{**/node_modules/**,**/.git/**}', 20);

    if (!uris.length) {
      vscode.window.showWarningMessage(`Audish: no file found for ${ref.raw}`);
      return undefined;
    }

    const chosen = uris.length === 1
      ? uris[0]
      : await pickFile(uris, storage, ref.name);
    if (!chosen) return undefined;

    return {
      file: storage.toRelativePath(chosen.fsPath),
      line: ref.line ?? 0,
      label: ref.line !== undefined ? `${ref.name}:${ref.line + 1}` : ref.name
    };
  }
}

async function pickSymbol(
  symbols: vscode.SymbolInformation[],
  name: string
): Promise<vscode.SymbolInformation | undefined> {
  const picked = await vscode.window.showQuickPick(
    symbols.map(s => ({
      label: s.name,
      description: s.containerName,
      detail: `${vscode.workspace.asRelativePath(s.location.uri)}:${s.location.range.start.line + 1}`,
      symbol: s
    })),
    { placeHolder: `Multiple matches for @#${name} — pick one` }
  );
  return picked?.symbol;
}

async function pickFile(
  uris: vscode.Uri[],
  storage: StorageManager,
  name: string
): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showQuickPick(
    uris.map(u => ({
      label: storage.toRelativePath(u.fsPath),
      uri: u
    })),
    { placeHolder: `Multiple matches for @${name} — pick one` }
  );
  return picked?.uri;
}
