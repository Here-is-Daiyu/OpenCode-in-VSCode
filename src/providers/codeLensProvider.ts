import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
//  Regex patterns for detecting code constructs
// ---------------------------------------------------------------------------

/**
 * Simple regex-based detection of functions, classes, and exports.
 *
 * Covers the most common patterns across JS/TS, Python, Rust, Go, etc.
 * Intentionally avoids full AST parsing to stay lightweight and
 * language-agnostic.
 */
const PATTERNS: { pattern: RegExp; languages?: string[] }[] = [
  // JS/TS: function declarations, arrow functions, class declarations
  {
    pattern: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm,
    languages: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
  },
  {
    pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
    languages: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
  },
  {
    pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm,
    languages: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
  },
  // Python: def, async def, class
  {
    pattern: /^(?:async\s+)?def\s+(\w+)/gm,
    languages: ['python'],
  },
  {
    pattern: /^class\s+(\w+)/gm,
    languages: ['python'],
  },
  // Rust: fn, pub fn, struct, impl
  {
    pattern: /^(?:pub(?:\(crate\))?\s+)?(?:async\s+)?fn\s+(\w+)/gm,
    languages: ['rust'],
  },
  {
    pattern: /^(?:pub(?:\(crate\))?\s+)?(?:struct|enum|impl)\s+(\w+)/gm,
    languages: ['rust'],
  },
  // Go: func
  {
    pattern: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/gm,
    languages: ['go'],
  },
  // Java / C# / Kotlin: method-like patterns (simplified)
  {
    pattern: /^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?\w+\s+(\w+)\s*\(/gm,
    languages: ['java', 'csharp', 'kotlin'],
  },
  // Generic fallback for less common languages — class keyword
  {
    pattern: /^(?:export\s+)?class\s+(\w+)/gm,
  },
];

// ---------------------------------------------------------------------------
//  CodeLens actions
// ---------------------------------------------------------------------------

interface CodeLensAction {
  title: string;
  command: string;
  tooltip: string;
  /** Prefix prepended to the function/class text when sending to chat. */
  prompt: string;
}

const ACTIONS: CodeLensAction[] = [
  {
    title: '$(comment-discussion) Explain',
    command: 'opencode.codeLens.explain',
    tooltip: 'Ask AI to explain this code',
    prompt: 'Explain the following code:\n\n',
  },
  {
    title: '$(sparkle) Improve',
    command: 'opencode.codeLens.improve',
    tooltip: 'Ask AI for improvement suggestions',
    prompt: 'Suggest improvements for the following code:\n\n',
  },
  {
    title: '$(beaker) Add Tests',
    command: 'opencode.codeLens.addTests',
    tooltip: 'Ask AI to generate tests',
    prompt: 'Write tests for the following code:\n\n',
  },
];

// ---------------------------------------------------------------------------
//  Provider
// ---------------------------------------------------------------------------

/**
 * Provides CodeLens hints on functions, classes, and exports that let the
 * user send the code block to the AI chat for explanation, improvement, or
 * test generation.
 *
 * Disabled by default — enable via the `opencode.editor.codeLensEnabled`
 * setting.
 */
export class OpenCodeCodeLensProvider implements vscode.CodeLensProvider {
  private _enabled = false;
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor() {}

  /**
   * Enable or disable the CodeLens provider.  When toggled, all open editors
   * are refreshed.
   */
  setEnabled(enabled: boolean): void {
    if (this._enabled !== enabled) {
      this._enabled = enabled;
      this._onDidChangeCodeLenses.fire();
    }
  }

  // -------------------------------------------------------------------------
  //  CodeLensProvider interface
  // -------------------------------------------------------------------------

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this._enabled) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const languageId = document.languageId;

    for (const { pattern, languages } of PATTERNS) {
      // Skip patterns that are language-specific and don't match
      if (languages && !languages.includes(languageId)) {
        continue;
      }

      // Reset the regex (global flag)
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const pos = document.positionAt(match.index);
        const range = new vscode.Range(pos, pos);

        for (const action of ACTIONS) {
          lenses.push(new vscode.CodeLens(range, {
            title: action.title,
            command: action.command,
            tooltip: action.tooltip,
            arguments: [document.uri, range],
          }));
        }
      }
    }

    return lenses;
  }

  resolveCodeLens(codeLens: vscode.CodeLens): vscode.CodeLens {
    // Already resolved during provide — nothing extra needed
    return codeLens;
  }

  // -------------------------------------------------------------------------
  //  Disposable
  // -------------------------------------------------------------------------

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}

// ---------------------------------------------------------------------------
//  Command registration helper
// ---------------------------------------------------------------------------

/**
 * Register the CodeLens action commands.
 *
 * Call this once from `activate()` (or from `registerCommands`).  The
 * returned disposables should be pushed onto `context.subscriptions`.
 */
export function registerCodeLensCommands(
  postToChat: (text: string) => void,
): vscode.Disposable[] {
  return ACTIONS.map(action =>
    vscode.commands.registerCommand(
      action.command,
      async (uri: vscode.Uri, range: vscode.Range) => {
        const document = await vscode.workspace.openTextDocument(uri);

        // Determine the function / class body by looking for the next
        // blank-line delimited block or a fixed line count, whichever is
        // shorter.
        const startLine = range.start.line;
        let endLine = startLine;
        const maxLines = Math.min(startLine + 80, document.lineCount - 1);

        // Walk down to find the rough end of the block
        let braceDepth = 0;
        let started = false;
        for (let i = startLine; i <= maxLines; i++) {
          const lineText = document.lineAt(i).text;
          for (const ch of lineText) {
            if (ch === '{' || ch === '(') { braceDepth++; started = true; }
            if (ch === '}' || ch === ')') { braceDepth--; }
          }
          endLine = i;
          if (started && braceDepth <= 0) { break; }
        }

        // For Python / indentation-based languages without braces
        if (!started) {
          const baseIndent = document.lineAt(startLine).firstNonWhitespaceCharacterIndex;
          for (let i = startLine + 1; i <= maxLines; i++) {
            const line = document.lineAt(i);
            if (!line.isEmptyOrWhitespace && line.firstNonWhitespaceCharacterIndex <= baseIndent) {
              break;
            }
            endLine = i;
          }
        }

        const codeRange = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
        const code = document.getText(codeRange);
        const lang = document.languageId;

        const message = `${action.prompt}\`\`\`${lang}\n${code}\n\`\`\``;
        postToChat(message);
      },
    ),
  );
}
