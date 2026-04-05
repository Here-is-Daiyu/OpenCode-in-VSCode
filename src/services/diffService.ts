import * as vscode from 'vscode';
import type { FileDiff } from '../types/opencode';
import * as path from 'path';

// ---------------------------------------------------------------------------
//  Virtual document content provider for original file contents
// ---------------------------------------------------------------------------

/**
 * Provides virtual document content for the "opencode-diff" URI scheme.
 *
 * When showing a side-by-side diff, the *original* (pre-AI) content lives in
 * a virtual document while the *modified* version is the real on-disk file.
 */
class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private contents = new Map<string, string>();
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange = this._onDidChange.event;

  /**
   * Called by VSCode when the virtual document needs to be materialised.
   */
  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(this.getKey(uri)) ?? '';
  }

  /**
   * Store original content for a given file path and return the corresponding
   * virtual URI that can be opened via `vscode.diff`.
   */
  setContent(filePath: string, content: string, side: 'original' | 'modified' = 'original'): vscode.Uri {
    const uri = this.toUri(filePath, side);
    this.contents.set(this.getKey(uri), content);
    this._onDidChange.fire(uri);
    return uri;
  }

  /**
   * Remove cached content for a path.
   */
  clearContent(filePath: string): void {
    this.contents.delete(this.getKey(this.toUri(filePath, 'original')));
    this.contents.delete(this.getKey(this.toUri(filePath, 'modified')));
  }

  /**
   * Remove all cached content.
   */
  clearAll(): void {
    this.contents.clear();
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.contents.clear();
  }

  private toUri(filePath: string, side: 'original' | 'modified'): vscode.Uri {
    const normalised = filePath.replace(/\\/g, '/');
    return vscode.Uri.parse(`opencode-diff:${normalised}`).with({
      query: side,
      fragment: '',
    });
  }

  private getKey(uri: vscode.Uri): string {
    return uri.toString(true);
  }
}

// ---------------------------------------------------------------------------
//  Inline diff decoration types
// ---------------------------------------------------------------------------

const addedDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
  isWholeLine: true,
  overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
  overviewRulerLane: vscode.OverviewRulerLane.Left,
});

const deletedDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
  isWholeLine: true,
  overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
  overviewRulerLane: vscode.OverviewRulerLane.Left,
});

type LineDiffOp = 'equal' | 'insert' | 'delete';

type ChangesEditorResource = [
  // Resource shown in the multi-diff file list.
  resource: vscode.Uri,
  original: vscode.Uri | undefined,
  modified: vscode.Uri | undefined,
];

type SessionDiffQuickPickItem = vscode.QuickPickItem & {
  action: 'review-all' | 'open-file';
  diff?: FileDiff;
};

const MAX_INLINE_DIFF_MATRIX_CELLS = 1_000_000;

// ---------------------------------------------------------------------------
//  DiffService
// ---------------------------------------------------------------------------

/**
 * Manages file diff display using VSCode's native diff editor as well as
 * inline diff decorations on the current editor.
 */
export class DiffService implements vscode.Disposable {
  private diffContentProvider: DiffContentProvider;
  private providerRegistration: vscode.Disposable;

  /** Map of file path → inline decoration ranges. */
  private inlineDiffDecorations = new Map<string, { additions: vscode.Range[]; deletions: vscode.Range[] }>();

  constructor(private context: vscode.ExtensionContext) {
    this.diffContentProvider = new DiffContentProvider();
    this.providerRegistration = vscode.workspace.registerTextDocumentContentProvider(
      'opencode-diff',
      this.diffContentProvider,
    );
    context.subscriptions.push(this.providerRegistration);
  }

  // -------------------------------------------------------------------------
  //  Side-by-side diff
  // -------------------------------------------------------------------------

  /**
   * Open a side-by-side diff editor for a single {@link FileDiff}.
   *
   * The *original* content is extracted from the unified diff (lines prefixed
   * with `-` or ` `) and served via a virtual document.  The *modified* side
   * points to the real file on disk.
   */
  async showFileDiff(fileDiff: FileDiff, options?: vscode.TextDocumentShowOptions): Promise<void> {
    const fullPath = this.resolvePath(fileDiff.path);

    const filename = path.basename(fileDiff.path);

    if (fileDiff.status === 'added') {
      // New file — just open it (no original to compare against)
      const uri = vscode.Uri.file(fullPath);
      await vscode.window.showTextDocument(uri, options ?? {});
      return;
    }

    // Build original content from the unified diff, or fall back to empty
    const originalContent = fileDiff.diff
      ? this.extractOriginalFromDiff(fileDiff.diff)
      : '';

    const originalUri = this.diffContentProvider.setContent(fullPath, originalContent, 'original');

    if (fileDiff.status === 'deleted') {
      // Deleted file — show the original on both sides (modified will be empty)
      const deletedUri = this.diffContentProvider.setContent(fullPath, '', 'modified');
      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        deletedUri,
        `${filename} (Deleted by AI)`,
        options,
      );
      return;
    }

    // Modified — left = original, right = current file on disk
    const modifiedUri = vscode.Uri.file(fullPath);
    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      `${filename} (AI Changes)`,
      options,
    );
  }

  async showTextDiff(filePath: string, original: string, modified: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    const originalUri = this.diffContentProvider.setContent(fullPath, original, 'original');
    const modifiedUri = this.diffContentProvider.setContent(fullPath, modified, 'modified');

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      `${this.getTitle(filePath, fullPath)} (AI Changes)`,
    );
  }

  /**
   * Open all diffs for a session.
   *
   * Each diff is shown in its own tab via the native diff editor.  When there
   * are multiple files a quick-pick is shown first so the user can choose.
   */
  async showSessionDiffs(diffs: FileDiff[]): Promise<void> {
    if (diffs.length === 0) {
      vscode.window.showInformationMessage('No file changes in the current session.');
      return;
    }

    if (diffs.length === 1) {
      await this.showFileDiff(diffs[0]);
      return;
    }

    // Multi-file: show quick-pick
    const items: SessionDiffQuickPickItem[] = diffs.map(d => ({
      label: `$(${this.statusIcon(d.status)}) ${d.path}`,
      description: `+${d.additions} -${d.deletions}`,
      action: 'open-file',
      diff: d,
    }));

    const picks = await vscode.window.showQuickPick<SessionDiffQuickPickItem>(
      [
        {
          label: '$(files) Review All Changes',
          description: `${diffs.length} files changed`,
          action: 'review-all',
        },
        ...items,
      ],
      { placeHolder: 'Select a file to view diff or review all changes', canPickMany: false },
    );

    if (!picks) {
      return;
    }

    if (picks.action === 'review-all') {
      await this.showAllSessionDiffs(diffs);
    } else if (picks.diff) {
      await this.showFileDiff(picks.diff);
    }
  }

  async showAllSessionDiffs(diffs: FileDiff[]): Promise<void> {
    if (diffs.length === 0) {
      vscode.window.showInformationMessage('No file changes in the current session.');
      return;
    }

    try {
      await this.openMultiDiffEditor(diffs);
    } catch {
      await this.openAllDiffsInGroup(diffs);
    }
  }

  // -------------------------------------------------------------------------
  //  Inline diff decorations
  // -------------------------------------------------------------------------

  /**
   * Apply inline diff decorations (added / deleted line highlights) to an
   * editor that has the given file open.
   */
  showInlineDiff(filePath: string, additions: vscode.Range[], deletions: vscode.Range[]): void {
    const normalised = this.normalisePath(filePath);
    this.inlineDiffDecorations.set(normalised, { additions, deletions });
    this.applyInlineDecorations(normalised);
  }

  /**
   * Compute and apply inline diff decorations by comparing the current file on
   * disk with the updated content received from the server.
   */
  async applyInlineDiffFromContent(filePath: string, newContent: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    const fileUri = vscode.Uri.file(fullPath);

    let originalContent = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      originalContent = new TextDecoder().decode(bytes);
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') {
        throw error;
      }
    }

    const { additions, deletions } = this.computeInlineDiffRanges(originalContent, newContent);
    if (additions.length === 0 && deletions.length === 0) {
      this.clearInlineDiff(fullPath);
      return;
    }

    this.showInlineDiff(fullPath, additions, deletions);
  }

  /**
   * Clear inline diff decorations.  If `filePath` is provided only that file
   * is cleared; otherwise all inline decorations are removed.
   */
  clearInlineDiff(filePath?: string): void {
    if (filePath) {
      const normalised = this.normalisePath(filePath);
      this.inlineDiffDecorations.delete(normalised);
      this.applyInlineDecorations(normalised);
    } else {
      // Clear everything
      for (const editor of vscode.window.visibleTextEditors) {
        editor.setDecorations(addedDecoration, []);
        editor.setDecorations(deletedDecoration, []);
      }
      this.inlineDiffDecorations.clear();
    }
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  /**
   * Extract the original file content from a unified diff string.
   *
   * Lines starting with `-` (removal) or ` ` (context) are part of the
   * original.  Lines starting with `+` belong only to the modified version.
   * Header lines (`---`, `+++`, `@@`) are skipped.
   */
  private extractOriginalFromDiff(diff: string): string {
    const lines: string[] = [];
    for (const raw of diff.split('\n')) {
      if (raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('@@')) {
        continue;
      }
      if (raw.startsWith('-')) {
        lines.push(raw.slice(1));
      } else if (raw.startsWith('+')) {
        // Skip — belongs to the modified side
        continue;
      } else if (raw.startsWith(' ')) {
        lines.push(raw.slice(1));
      } else if (raw.startsWith('\\')) {
        // "\ No newline at end of file" — skip
        continue;
      } else {
        // Outside of a hunk — could be diff header; skip
      }
    }
    return lines.join('\n');
  }

  /**
   * Build line-level addition / deletion ranges for inline diff decorations.
   */
  private computeInlineDiffRanges(
    originalContent: string,
    newContent: string,
  ): { additions: vscode.Range[]; deletions: vscode.Range[] } {
    const originalLines = this.splitLines(originalContent);
    const newLines = this.splitLines(newContent);
    const operations = this.diffLineOperations(originalLines, newLines);

    const additions: vscode.Range[] = [];
    const deletions: vscode.Range[] = [];

    let currentNewLine = 0;
    let blockStartLine: number | undefined;
    let blockAdditionCount = 0;
    let blockDeletionCount = 0;

    const flushBlock = (): void => {
      if (blockStartLine === undefined) {
        return;
      }

      for (let offset = 0; offset < blockAdditionCount; offset += 1) {
        additions.push(this.createWholeLineRange(blockStartLine + offset));
      }

      if (blockDeletionCount > 0) {
        const maxLine = Math.max(newLines.length - 1, 0);
        const deletionStartLine = blockAdditionCount > 0
          ? blockStartLine
          : Math.min(currentNewLine, maxLine);

        const visibleDeletionCount = Math.min(blockDeletionCount, maxLine + 1);
        const availableForwardLines = maxLine - deletionStartLine + 1;
        const adjustedStartLine = availableForwardLines >= visibleDeletionCount
          ? deletionStartLine
          : Math.max(maxLine - visibleDeletionCount + 1, 0);

        for (let offset = 0; offset < visibleDeletionCount; offset += 1) {
          deletions.push(this.createWholeLineRange(adjustedStartLine + offset));
        }
      }

      blockStartLine = undefined;
      blockAdditionCount = 0;
      blockDeletionCount = 0;
    };

    for (const operation of operations) {
      switch (operation) {
        case 'equal':
          flushBlock();
          currentNewLine += 1;
          break;

        case 'insert':
          blockStartLine ??= currentNewLine;
          blockAdditionCount += 1;
          currentNewLine += 1;
          break;

        case 'delete':
          blockStartLine ??= currentNewLine;
          blockDeletionCount += 1;
          break;
      }
    }

    flushBlock();

    return { additions, deletions };
  }

  /**
   * Compute a simple line diff using LCS, with a fallback for very large files.
   */
  private diffLineOperations(originalLines: string[], newLines: string[]): LineDiffOp[] {
    const prefixLength = this.commonPrefixLength(originalLines, newLines);
    const suffixLength = this.commonSuffixLength(originalLines, newLines, prefixLength);

    const originalMiddle = originalLines.slice(prefixLength, originalLines.length - suffixLength);
    const newMiddle = newLines.slice(prefixLength, newLines.length - suffixLength);

    const operations: LineDiffOp[] = [];
    for (let index = 0; index < prefixLength; index += 1) {
      operations.push('equal');
    }

    const matrixCells = originalMiddle.length * newMiddle.length;
    if (matrixCells > MAX_INLINE_DIFF_MATRIX_CELLS) {
      for (let index = 0; index < originalMiddle.length; index += 1) {
        operations.push('delete');
      }
      for (let index = 0; index < newMiddle.length; index += 1) {
        operations.push('insert');
      }
    } else {
      const lcs = Array.from(
        { length: originalMiddle.length + 1 },
        () => new Uint32Array(newMiddle.length + 1),
      );

      for (let i = originalMiddle.length - 1; i >= 0; i -= 1) {
        for (let j = newMiddle.length - 1; j >= 0; j -= 1) {
          lcs[i][j] = originalMiddle[i] === newMiddle[j]
            ? lcs[i + 1][j + 1] + 1
            : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
      }

      let i = 0;
      let j = 0;
      while (i < originalMiddle.length && j < newMiddle.length) {
        if (originalMiddle[i] === newMiddle[j]) {
          operations.push('equal');
          i += 1;
          j += 1;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
          operations.push('delete');
          i += 1;
        } else {
          operations.push('insert');
          j += 1;
        }
      }

      while (i < originalMiddle.length) {
        operations.push('delete');
        i += 1;
      }

      while (j < newMiddle.length) {
        operations.push('insert');
        j += 1;
      }
    }

    for (let index = 0; index < suffixLength; index += 1) {
      operations.push('equal');
    }

    return operations;
  }

  /**
   * Apply stored inline decorations for a file to all matching visible
   * editors.
   */
  private applyInlineDecorations(normalisedPath: string): void {
    const data = this.inlineDiffDecorations.get(normalisedPath);
    for (const editor of vscode.window.visibleTextEditors) {
      const editorPath = this.normalisePath(editor.document.uri.fsPath);
      if (editorPath === normalisedPath) {
        editor.setDecorations(deletedDecoration, data?.deletions ?? []);
        editor.setDecorations(addedDecoration, data?.additions ?? []);
      }
    }
  }

  private commonPrefixLength(originalLines: string[], newLines: string[]): number {
    let index = 0;
    while (
      index < originalLines.length
      && index < newLines.length
      && originalLines[index] === newLines[index]
    ) {
      index += 1;
    }
    return index;
  }

  private commonSuffixLength(
    originalLines: string[],
    newLines: string[],
    prefixLength: number,
  ): number {
    let index = 0;
    while (
      index < originalLines.length - prefixLength
      && index < newLines.length - prefixLength
      && originalLines[originalLines.length - 1 - index] === newLines[newLines.length - 1 - index]
    ) {
      index += 1;
    }
    return index;
  }

  private splitLines(content: string): string[] {
    return content.split(/\r?\n/u);
  }

  private createWholeLineRange(line: number): vscode.Range {
    const safeLine = Math.max(line, 0);
    return new vscode.Range(safeLine, 0, safeLine, 0);
  }

  private async openMultiDiffEditor(diffs: FileDiff[]): Promise<void> {
    const resources = diffs.map(diff => this.buildChangesEditorResource(diff));

    // `vscode.changes` is VS Code's stable command for opening the multi diff editor.
    await vscode.commands.executeCommand(
      'vscode.changes',
      'OpenCode Session Changes',
      resources,
    );
  }

  private async openAllDiffsInGroup(diffs: FileDiff[]): Promise<void> {
    const existingColumns = new Set(
      vscode.window.tabGroups.all
        .map(group => group.viewColumn)
        .filter((column): column is vscode.ViewColumn => column !== undefined),
    );

    await this.showFileDiff(diffs[0], {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
    });

    const targetColumn = this.findBesideGroupColumn(existingColumns)
      ?? this.getActiveViewColumn()
      ?? vscode.ViewColumn.Beside;

    for (const diff of diffs.slice(1)) {
      await this.showFileDiff(diff, {
        preview: false,
        viewColumn: targetColumn,
      });
    }
  }

  private buildChangesEditorResource(fileDiff: FileDiff): ChangesEditorResource {
    const fullPath = this.resolvePath(fileDiff.path);
    const resourceUri = vscode.Uri.file(fullPath);

    if (fileDiff.status === 'added') {
      return [resourceUri, undefined, resourceUri];
    }

    const originalContent = fileDiff.diff
      ? this.extractOriginalFromDiff(fileDiff.diff)
      : '';
    const originalUri = this.diffContentProvider.setContent(fullPath, originalContent, 'original');

    if (fileDiff.status === 'deleted') {
      return [resourceUri, originalUri, undefined];
    }

    return [resourceUri, originalUri, resourceUri];
  }

  private findBesideGroupColumn(existingColumns: ReadonlySet<vscode.ViewColumn>): vscode.ViewColumn | undefined {
    return vscode.window.tabGroups.all.find(group => {
      const { viewColumn } = group;
      return viewColumn !== undefined && !existingColumns.has(viewColumn);
    })?.viewColumn;
  }

  private getActiveViewColumn(): vscode.ViewColumn | undefined {
    return vscode.window.activeTextEditor?.viewColumn ?? vscode.window.tabGroups.activeTabGroup.viewColumn;
  }

  private normalisePath(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase();
  }

  private resolvePath(filePath: string): string {
    if (/^file:/i.test(filePath)) {
      return vscode.Uri.parse(filePath).fsPath;
    }

    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? path.join(root, filePath) : filePath;
  }

  private getTitle(filePath: string, fullPath: string): string {
    if (!path.isAbsolute(fullPath)) {
      return filePath;
    }

    const relative = vscode.workspace.asRelativePath(vscode.Uri.file(fullPath), false);
    return relative || path.basename(fullPath) || filePath;
  }

  private statusIcon(status: FileDiff['status']): string {
    switch (status) {
      case 'added': return 'diff-added';
      case 'deleted': return 'diff-removed';
      case 'modified': return 'diff-modified';
      default: return 'file';
    }
  }

  // -------------------------------------------------------------------------
  //  Disposable
  // -------------------------------------------------------------------------

  dispose(): void {
    this.clearInlineDiff();
    this.diffContentProvider.dispose();
    addedDecoration.dispose();
    deletedDecoration.dispose();
  }
}
