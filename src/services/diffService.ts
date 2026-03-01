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
    const key = uri.path;
    return this.contents.get(key) ?? '';
  }

  /**
   * Store original content for a given file path and return the corresponding
   * virtual URI that can be opened via `vscode.diff`.
   */
  setContent(filePath: string, content: string): vscode.Uri {
    const normalised = filePath.replace(/\\/g, '/');
    this.contents.set(normalised, content);
    const uri = vscode.Uri.parse(`opencode-diff:${normalised}?original`);
    this._onDidChange.fire(uri);
    return uri;
  }

  /**
   * Remove cached content for a path.
   */
  clearContent(filePath: string): void {
    const normalised = filePath.replace(/\\/g, '/');
    this.contents.delete(normalised);
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
  async showFileDiff(fileDiff: FileDiff): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const fullPath = path.isAbsolute(fileDiff.path)
      ? fileDiff.path
      : path.join(workspaceRoot, fileDiff.path);

    const filename = path.basename(fileDiff.path);

    if (fileDiff.status === 'added') {
      // New file — just open it (no original to compare against)
      const uri = vscode.Uri.file(fullPath);
      await vscode.window.showTextDocument(uri);
      return;
    }

    // Build original content from the unified diff, or fall back to empty
    const originalContent = fileDiff.diff
      ? this.extractOriginalFromDiff(fileDiff.diff)
      : '';

    const originalUri = this.diffContentProvider.setContent(fullPath, originalContent);

    if (fileDiff.status === 'deleted') {
      // Deleted file — show the original on both sides (modified will be empty)
      const deletedUri = this.diffContentProvider.setContent(
        `${fullPath}__deleted`,
        '',
      );
      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        deletedUri,
        `${filename} (Deleted by AI)`,
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
    const items = diffs.map(d => ({
      label: `$(${this.statusIcon(d.status)}) ${d.path}`,
      description: `+${d.additions} -${d.deletions}`,
      _diff: d,
    }));

    // Add an "Open All" option at the top
    const ALL_LABEL = '$(files) Open All Diffs';
    const picks = await vscode.window.showQuickPick(
      [{ label: ALL_LABEL, description: `${diffs.length} files changed`, _diff: undefined as unknown as FileDiff }, ...items],
      { placeHolder: 'Select a file to view diff', canPickMany: false },
    );

    if (!picks) {
      return;
    }

    if (picks.label === ALL_LABEL) {
      for (const d of diffs) {
        await this.showFileDiff(d);
      }
    } else if (picks._diff) {
      await this.showFileDiff(picks._diff);
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
   * Apply stored inline decorations for a file to all matching visible
   * editors.
   */
  private applyInlineDecorations(normalisedPath: string): void {
    const data = this.inlineDiffDecorations.get(normalisedPath);
    for (const editor of vscode.window.visibleTextEditors) {
      const editorPath = this.normalisePath(editor.document.uri.fsPath);
      if (editorPath === normalisedPath) {
        editor.setDecorations(addedDecoration, data?.additions ?? []);
        editor.setDecorations(deletedDecoration, data?.deletions ?? []);
      }
    }
  }

  private normalisePath(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase();
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
