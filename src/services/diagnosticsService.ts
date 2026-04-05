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
    const filePath = vscode.workspace.asRelativePath(editor.document.uri);
    return this.formatDiagnostics(filePath, diags);
  }

  // 格式化诊断信息
  private formatDiagnostics(filePath: string, diags: vscode.Diagnostic[]): string {
    const lines = diags.map(d => {
      const severity = vscode.DiagnosticSeverity[d.severity]; // Error/Warning/Info/Hint
      const line = d.range.start.line + 1;
      const col = d.range.start.character + 1;
      const source = d.source ? ` (${d.source})` : '';
      return `${filePath}:${line}:${col} [${severity}]${source} ${d.message}`;
    });
    return `Current file diagnostics:\n${lines.join('\n')}`;
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
