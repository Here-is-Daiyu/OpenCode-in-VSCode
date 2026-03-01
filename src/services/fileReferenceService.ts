import * as vscode from 'vscode';
import * as path from 'path';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

/** A single completion item returned by the file reference service. */
export interface FileCompletion {
  /** Display filename (e.g. `index.ts`). */
  label: string;
  /** Full workspace-relative path (e.g. `src/index.ts`). */
  detail: string;
  /** What kind of match this is. */
  kind: 'file' | 'folder' | 'symbol';
  /** The path string that should be inserted into the input. */
  insertText: string;
}

/** Resolved file content for an @-reference. */
export interface ResolvedFileReference {
  path: string;
  content: string;
  language: string;
}

/** Info about the current selection in the active editor. */
export interface SelectionInfo {
  path: string;
  content: string;
  language: string;
  range: vscode.Range;
}

/** Basic file info for the active editor. */
export interface CurrentFileInfo {
  path: string;
  language: string;
}

// ---------------------------------------------------------------------------
//  Exclusion patterns
// ---------------------------------------------------------------------------

/** Glob patterns to exclude when searching workspace files. */
const EXCLUDE_PATTERNS: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/.mypy_cache/**',
  '**/.pytest_cache/**',
  '**/target/**',        // Rust / Java
  '**/vendor/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
];

/** Maximum number of results returned by {@link FileReferenceService.getFileCompletions}. */
const MAX_RESULTS = 50;

// ---------------------------------------------------------------------------
//  FileReferenceService
// ---------------------------------------------------------------------------

/**
 * Handles `@file` references in the chat input.
 *
 * - Provides fuzzy file completions for `@` queries.
 * - Resolves a file path to its content and language ID.
 * - Reads the current editor selection / file info.
 */
export class FileReferenceService implements vscode.Disposable {
  /** Recently accessed files — used to boost relevance. */
  private recentFiles: string[] = [];
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    // Track recently opened files
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.trackRecentFile(editor.document.uri.fsPath);
        }
      }),
    );

    // Seed with the currently active editor
    if (vscode.window.activeTextEditor) {
      this.trackRecentFile(vscode.window.activeTextEditor.document.uri.fsPath);
    }
  }

  // -------------------------------------------------------------------------
  //  File completions
  // -------------------------------------------------------------------------

  /**
   * Search workspace files matching `query` and return completion items.
   *
   * The query is used as a fuzzy glob (e.g. "serv" matches files
   * containing "serv" in their name).
   * Results are sorted with recently opened files first.
   */
  async getFileCompletions(query: string): Promise<FileCompletion[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return [];
    }

    // Build a glob pattern
    const sanitised = query.replace(/[{}[\]()!?]/g, '');
    const pattern = sanitised
      ? `**/*${sanitised}*`
      : '**/*';

    const excludePattern = `{${EXCLUDE_PATTERNS.join(',')}}`;

    const uris = await vscode.workspace.findFiles(pattern, excludePattern, MAX_RESULTS * 2);

    // Build completions
    const completions: FileCompletion[] = uris.map(uri => {
      const relativePath = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/');
      const filename = path.basename(uri.fsPath);
      return {
        label: filename,
        detail: relativePath,
        kind: 'file' as const,
        insertText: relativePath,
      };
    });

    // Sort: recently opened files first, then alphabetically
    const recentSet = new Set(
      this.recentFiles.map(f => path.relative(workspaceRoot, f).replace(/\\/g, '/').toLowerCase()),
    );

    completions.sort((a, b) => {
      const aRecent = recentSet.has(a.detail.toLowerCase());
      const bRecent = recentSet.has(b.detail.toLowerCase());
      if (aRecent && !bRecent) { return -1; }
      if (!aRecent && bRecent) { return 1; }
      return a.detail.localeCompare(b.detail);
    });

    return completions.slice(0, MAX_RESULTS);
  }

  // -------------------------------------------------------------------------
  //  Resolve file reference
  // -------------------------------------------------------------------------

  /**
   * Read a file's content and determine its language.
   *
   * `filePath` may be workspace-relative or absolute.
   */
  async resolveFileReference(filePath: string): Promise<ResolvedFileReference> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspaceRoot, filePath);

    const uri = vscode.Uri.file(fullPath);

    // Try to read via the already-open document first (avoids disk I/O)
    const openDoc = vscode.workspace.textDocuments.find(
      d => d.uri.fsPath === uri.fsPath,
    );

    if (openDoc) {
      return {
        path: fullPath,
        content: openDoc.getText(),
        language: openDoc.languageId,
      };
    }

    // Fall back to reading from disk
    const content = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(content).toString('utf-8');
    const language = this.detectLanguage(fullPath);

    return { path: fullPath, content: text, language };
  }

  // -------------------------------------------------------------------------
  //  Editor state
  // -------------------------------------------------------------------------

  /**
   * Get the currently selected text from the active editor, or `null` if
   * nothing is selected.
   */
  getCurrentSelection(): SelectionInfo | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return null;
    }

    return {
      path: editor.document.uri.fsPath,
      content: editor.document.getText(editor.selection),
      language: editor.document.languageId,
      range: editor.selection,
    };
  }

  /**
   * Get basic info about the file in the currently active editor, or `null`
   * if no editor is open.
   */
  getCurrentFile(): CurrentFileInfo | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    return {
      path: editor.document.uri.fsPath,
      language: editor.document.languageId,
    };
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private trackRecentFile(fsPath: string): void {
    // Keep at most 20 recent files, with most recent at the front
    const idx = this.recentFiles.indexOf(fsPath);
    if (idx !== -1) {
      this.recentFiles.splice(idx, 1);
    }
    this.recentFiles.unshift(fsPath);
    if (this.recentFiles.length > 20) {
      this.recentFiles.pop();
    }
  }

  /**
   * Detect a VSCode language ID from a file extension.
   *
   * This is a best-effort heuristic — it covers the most common languages.
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.py': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.lua': 'lua',
      '.sh': 'shellscript',
      '.bash': 'shellscript',
      '.zsh': 'shellscript',
      '.ps1': 'powershell',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.json': 'json',
      '.jsonc': 'jsonc',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.xml': 'xml',
      '.md': 'markdown',
      '.sql': 'sql',
      '.r': 'r',
      '.dart': 'dart',
      '.vue': 'vue',
      '.svelte': 'svelte',
      '.zig': 'zig',
      '.ex': 'elixir',
      '.exs': 'elixir',
      '.erl': 'erlang',
      '.hs': 'haskell',
      '.ml': 'ocaml',
      '.clj': 'clojure',
      '.nim': 'nim',
      '.tf': 'terraform',
      '.dockerfile': 'dockerfile',
    };

    // Check for special filenames
    const basename = path.basename(filePath).toLowerCase();
    if (basename === 'dockerfile') { return 'dockerfile'; }
    if (basename === 'makefile') { return 'makefile'; }
    if (basename.endsWith('.env')) { return 'dotenv'; }

    return map[ext] ?? 'plaintext';
  }

  // -------------------------------------------------------------------------
  //  Disposable
  // -------------------------------------------------------------------------

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
