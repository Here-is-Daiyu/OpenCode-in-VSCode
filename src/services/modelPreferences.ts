import * as fs from 'fs/promises';
import * as path from 'path';
import type { Logger } from './logger';

export interface ModelPrefRef {
  providerID: string;
  modelID: string;
}

export interface ModelPreferences {
  recent: ModelPrefRef[];
  favorite: ModelPrefRef[];
  variant: Record<string, string | undefined>;
}

const MAX_RECENT = 10; // Match TUI

export class ModelPreferencesService {
  private filePath: string;
  private logger?: Logger;

  constructor(statePath: string, logger?: Logger) {
    this.filePath = path.join(statePath, 'model.json');
    this.logger = logger;
  }

  /** Read current preferences from disk. Returns empty prefs on any error. */
  async read(): Promise<ModelPreferences> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        recent: Array.isArray(parsed.recent) ? parsed.recent.filter(isValidRef) : [],
        favorite: Array.isArray(parsed.favorite) ? parsed.favorite.filter(isValidRef) : [],
        variant: (typeof parsed.variant === 'object' && parsed.variant !== null) ? parsed.variant : {},
      };
    } catch {
      return { recent: [], favorite: [], variant: {} };
    }
  }

  /** Write preferences to disk. Silently ignores errors. */
  private async write(prefs: ModelPreferences): Promise<void> {
    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(prefs, null, 2), 'utf-8');
    } catch (err) {
      this.logger?.warn('Failed to write model preferences', err);
    }
  }

  /** Toggle a model's favorite status. Returns updated prefs. */
  async toggleFavorite(ref: ModelPrefRef): Promise<ModelPreferences> {
    const prefs = await this.read();
    const index = prefs.favorite.findIndex(
      (f) => f.providerID === ref.providerID && f.modelID === ref.modelID,
    );
    if (index >= 0) {
      prefs.favorite.splice(index, 1);
    } else {
      prefs.favorite.unshift({ providerID: ref.providerID, modelID: ref.modelID });
    }
    await this.write(prefs);
    return prefs;
  }

  /** Add a model to the recent list. Returns updated prefs. */
  async addRecent(ref: ModelPrefRef): Promise<ModelPreferences> {
    const prefs = await this.read();
    // Remove if already present
    prefs.recent = prefs.recent.filter(
      (r) => !(r.providerID === ref.providerID && r.modelID === ref.modelID),
    );
    // Prepend
    prefs.recent.unshift({ providerID: ref.providerID, modelID: ref.modelID });
    // Cap at MAX_RECENT
    if (prefs.recent.length > MAX_RECENT) {
      prefs.recent = prefs.recent.slice(0, MAX_RECENT);
    }
    await this.write(prefs);
    return prefs;
  }

  /** Set a variant selection. Returns updated prefs. */
  async setVariant(key: string, variant: string | undefined): Promise<ModelPreferences> {
    const prefs = await this.read();
    if (variant === undefined) {
      delete prefs.variant[key];
    } else {
      prefs.variant[key] = variant;
    }
    await this.write(prefs);
    return prefs;
  }
}

function isValidRef(item: unknown): item is ModelPrefRef {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as ModelPrefRef).providerID === 'string' &&
    typeof (item as ModelPrefRef).modelID === 'string'
  );
}
