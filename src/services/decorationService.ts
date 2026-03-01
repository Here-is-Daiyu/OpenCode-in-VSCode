import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
//  Decoration types
// ---------------------------------------------------------------------------

/**
 * Gutter icon for files that have been modified by AI.
 *
 * Uses a simple circle indicator in the overview ruler and a subtle
 * background tint on the gutter so the user can spot AI-touched files.
 */
const modifiedGutterDecoration = vscode.window.createTextEditorDecorationType({
  gutterIconPath: undefined, // Will use overview ruler colour instead
  overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.modifiedForeground'),
  overviewRulerLane: vscode.OverviewRulerLane.Right,
  isWholeLine: true,
  light: {
    backgroundColor: 'rgba(255, 200, 0, 0.06)',
  },
  dark: {
    backgroundColor: 'rgba(255, 200, 0, 0.04)',
  },
});

/**
 * Decoration for files currently being processed by the AI.
 *
 * Shows a faint pulsing-style background (in practice a static tint — true
 * animation requires webview, which is out of scope here).
 */
const processingDecoration = vscode.window.createTextEditorDecorationType({
  isWholeLine: true,
  light: {
    backgroundColor: 'rgba(0, 120, 212, 0.05)',
    border: '1px dashed rgba(0, 120, 212, 0.2)',
  },
  dark: {
    backgroundColor: 'rgba(0, 120, 212, 0.05)',
    border: '1px dashed rgba(0, 120, 212, 0.2)',
  },
  overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.infoForeground'),
  overviewRulerLane: vscode.OverviewRulerLane.Full,
});

// ---------------------------------------------------------------------------
//  DecorationService
// ---------------------------------------------------------------------------

/**
 * Manages editor decorations for AI-related visuals such as "modified by AI"
 * gutter markers and "file being processed" indicators.
 */
export class DecorationService implements vscode.Disposable {
  /** Set of normalised file paths that have been marked as modified by AI. */
  private modifiedFiles = new Set<string>();

  /** Set of normalised file paths that are currently being processed. */
  private processingFiles = new Set<string>();

  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Re-apply decorations when the visible editors change
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => {
        this.refreshDecorations();
      }),
    );
  }

  // -------------------------------------------------------------------------
  //  Modified-file markers
  // -------------------------------------------------------------------------

  /**
   * Mark the given files as "modified by AI".
   *
   * The decoration is applied to every line of the file so the overview ruler
   * shows a continuous modified indicator.
   *
   * @param files - Absolute or workspace-relative file paths.
   */
  markModifiedFiles(files: string[]): void {
    for (const f of files) {
      this.modifiedFiles.add(this.normalise(f));
    }
    this.refreshDecorations();
  }

  /**
   * Remove all "modified by AI" markers.
   */
  clearModifiedMarks(): void {
    this.modifiedFiles.clear();
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(modifiedGutterDecoration, []);
    }
  }

  // -------------------------------------------------------------------------
  //  Processing indicator
  // -------------------------------------------------------------------------

  /**
   * Toggle the "currently being processed" decoration for a file.
   */
  setFileProcessing(filePath: string, processing: boolean): void {
    const normalised = this.normalise(filePath);
    if (processing) {
      this.processingFiles.add(normalised);
    } else {
      this.processingFiles.delete(normalised);
    }
    this.refreshDecorations();
  }

  // -------------------------------------------------------------------------
  //  Internal
  // -------------------------------------------------------------------------

  /**
   * Walk through all visible editors and (re-)apply the stored decorations.
   */
  private refreshDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const editorPath = this.normalise(editor.document.uri.fsPath);
      const lineCount = editor.document.lineCount;

      // Modified markers
      if (this.modifiedFiles.has(editorPath)) {
        const fullRange = new vscode.Range(0, 0, lineCount - 1, 0);
        editor.setDecorations(modifiedGutterDecoration, [fullRange]);
      } else {
        editor.setDecorations(modifiedGutterDecoration, []);
      }

      // Processing indicator
      if (this.processingFiles.has(editorPath)) {
        const fullRange = new vscode.Range(0, 0, lineCount - 1, 0);
        editor.setDecorations(processingDecoration, [fullRange]);
      } else {
        editor.setDecorations(processingDecoration, []);
      }
    }
  }

  private normalise(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase();
  }

  // -------------------------------------------------------------------------
  //  Disposable
  // -------------------------------------------------------------------------

  dispose(): void {
    this.clearModifiedMarks();
    this.processingFiles.clear();
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(processingDecoration, []);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    modifiedGutterDecoration.dispose();
    processingDecoration.dispose();
  }
}
