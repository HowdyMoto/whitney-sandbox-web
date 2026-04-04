import type { Config, RenderConfig } from './types.js';
import type { BloomConfig } from './rendering/BloomPass.js';

const STORAGE_KEY = 'whitney-current';
const PRESETS_KEY = 'whitney-presets';

export interface Snapshot {
  config: Config;
  renderConfig: RenderConfig;
  bloomConfig: BloomConfig;
  /** Shader param overrides: shaderKey → uniform → value */
  shaderParams: Record<string, Record<string, number>>;
}

export interface NamedPreset {
  name: string;
  snapshot: Snapshot;
}

// ─── Snapshot helpers ───────────────────────────────────────────────

export function takeSnapshot(
  config: Config, renderConfig: RenderConfig, bloomConfig: BloomConfig,
  getShaderParams: () => Record<string, Record<string, number>>,
): Snapshot {
  return {
    config: structuredClone(config),
    renderConfig: structuredClone(renderConfig),
    bloomConfig: structuredClone(bloomConfig),
    shaderParams: structuredClone(getShaderParams()),
  };
}

export function applySnapshot(
  snapshot: Snapshot,
  config: Config, renderConfig: RenderConfig, bloomConfig: BloomConfig,
  setShaderParams: (params: Record<string, Record<string, number>>) => void,
): void {
  // Config — copy only known keys to avoid stale fields
  Object.assign(config, snapshot.config);
  // RenderConfig — deep merge
  Object.assign(renderConfig.backgroundColor, snapshot.renderConfig.backgroundColor);
  Object.assign(renderConfig.dot, snapshot.renderConfig.dot);
  Object.assign(renderConfig.trail, snapshot.renderConfig.trail);
  Object.assign(renderConfig.pathLine, snapshot.renderConfig.pathLine);
  Object.assign(renderConfig.triggerLine, snapshot.renderConfig.triggerLine);
  Object.assign(renderConfig.noteText, snapshot.renderConfig.noteText);
  Object.assign(renderConfig.particle, snapshot.renderConfig.particle);
  Object.assign(renderConfig.colorScheme, snapshot.renderConfig.colorScheme);
  // BloomConfig
  Object.assign(bloomConfig, snapshot.bloomConfig);
  // Shader params
  if (snapshot.shaderParams) {
    setShaderParams(snapshot.shaderParams);
  }
}

// ─── Auto-save (current session) ───────────────────────────────────

export function saveCurrentState(snapshot: Snapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch { /* quota exceeded — silently skip */ }
}

export function loadCurrentState(): Snapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Snapshot : null;
  } catch { return null; }
}

// ─── Named presets ─────────────────────────────────────────────────

export function getPresets(): NamedPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) as NamedPreset[] : [];
  } catch { return []; }
}

function writePresets(presets: NamedPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch { /* quota exceeded */ }
}

export function savePreset(name: string, snapshot: Snapshot): void {
  const presets = getPresets();
  const idx = presets.findIndex(p => p.name === name);
  if (idx >= 0) {
    presets[idx] = { name, snapshot };
  } else {
    presets.push({ name, snapshot });
  }
  writePresets(presets);
}

export function deletePreset(name: string): void {
  writePresets(getPresets().filter(p => p.name !== name));
}
