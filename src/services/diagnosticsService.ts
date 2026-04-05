import * as vscode from 'vscode';

export class DiagnosticsService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  // 获取指定文件的诊断信息
  getDiagnosticsForUri(uri: vscode.Uri): vscode.Diagnostic[] {
    return vscode.languages.getDiagnostics(uri);
  }

  // 获取当前活动编辑器的诊断，格式化为文本
  getActiveEditorDiagnosticsText(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;
    const diags = vscode.languages.getDiagnostics(editor.document.uri);
    if (diags.length === 0) return undefined;
    const filePath = this.getDiagnosticFilePath(editor.document.uri);
    return this.formatDiagnostics(filePath, diags);
  }

  getAllDiagnosticsText(): string | undefined {
    const diagnostics = vscode.languages.getDiagnostics()
      .filter(([, diags]) => diags.length > 0);

    if (diagnostics.length === 0) {
      return undefined;
    }

    const groups = diagnostics.map(([uri, diags]) => {
      const filePath = this.getDiagnosticFilePath(uri);
      const lines = this.formatDiagnosticLines(filePath, diags, false)
        .map((line) => `  ${line}`);
      return `${filePath}:\n${lines.join('\n')}`;
    });

    return `Workspace diagnostics:\n\n${groups.join('\n\n')}`;
  }

  // 格式化诊断信息
  private formatDiagnostics(filePath: string, diags: vscode.Diagnostic[]): string {
    return `Current file diagnostics:\n${this.formatDiagnosticLines(filePath, diags).join('\n')}`;
  }

  private formatDiagnosticLines(
    filePath: string,
    diags: vscode.Diagnostic[],
    includeFilePath = true,
  ): string[] {
    return diags.map(d => {
      const severity = vscode.DiagnosticSeverity[d.severity]; // Error/Warning/Info/Hint
      const line = d.range.start.line + 1;
      const col = d.range.start.character + 1;
      const source = d.source ? ` (${d.source})` : '';
      const location = includeFilePath ? `${filePath}:${line}:${col}` : `${line}:${col}`;
      return `${location} [${severity}]${source} ${d.message}`;
    });
  }

  private getDiagnosticFilePath(uri: vscode.Uri): string {
    return uri.scheme === 'file'
      ? vscode.workspace.asRelativePath(uri)
      : uri.toString(true);
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
