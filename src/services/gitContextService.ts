import * as vscode from 'vscode';

interface GitExtensionApi {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}

interface GitApi {
  readonly repositories: GitRepository[];
  getRepository(uri: vscode.Uri): GitRepository | null;
}

interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: GitRepositoryState;
  diff(cached?: boolean): Promise<string>;
  status(): Promise<void>;
}

interface GitRepositoryState {
  readonly workingTreeChanges: GitChange[];
  readonly indexChanges: GitChange[];
}

interface GitChange {
  readonly uri: vscode.Uri;
}

export class GitContextService implements vscode.Disposable {
  async getUnstagedDiff(): Promise<string> {
    const repository = await this.getRepository();
    if (!repository) {
      return '';
    }

    return (await repository.diff()).trim();
  }

  async getStagedDiff(): Promise<string> {
    const repository = await this.getRepository();
    if (!repository) {
      return '';
    }

    return (await repository.diff(true)).trim();
  }

  async getChangeSummary(): Promise<string> {
    const repository = await this.getRepository();
    if (!repository) {
      return '';
    }

    await repository.status();

    const sections = [
      this.formatChangeSection('Staged changes', repository.state.indexChanges),
      this.formatChangeSection('Unstaged changes', repository.state.workingTreeChanges),
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  async getRepository(): Promise<GitRepository | undefined> {
    const gitExtension = vscode.extensions.getExtension<GitExtensionApi>('vscode.git');
    if (!gitExtension) {
      return undefined;
    }

    const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
    if (!git.enabled) {
      return undefined;
    }

    const api = git.getAPI(1);
    const activeUri = vscode.window.activeTextEditor?.document.uri;

    if (activeUri?.scheme === 'file') {
      const activeRepository = api.getRepository(activeUri);
      if (activeRepository) {
        return activeRepository;
      }
    }

    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (workspaceUri?.scheme === 'file') {
      const workspaceRepository = api.getRepository(workspaceUri);
      if (workspaceRepository) {
        return workspaceRepository;
      }
    }

    if (api.repositories.length === 0) {
      return undefined;
    }

    return api.repositories[0];
  }

  dispose(): void {
    // No resources to dispose yet.
  }

  private formatChangeSection(title: string, changes: readonly GitChange[]): string {
    const paths = [...new Set(changes.map(change => this.toRelativePath(change.uri)))].sort((a, b) => a.localeCompare(b));
    if (paths.length === 0) {
      return '';
    }

    return `${title}:\n${paths.map(filePath => `- ${filePath}`).join('\n')}`;
  }

  private toRelativePath(uri: vscode.Uri): string {
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    return relativePath || uri.fsPath;
  }
}
