import { useSyncExternalStore } from 'react';

export interface AssetRef {
  hash: string;
  mime: 'image/png' | 'image/jpeg';
}

/** The images the dev API knows about: the examples' plus whatever was uploaded this session. */
let assets: AssetRef[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const assetStore = {
  get: () => assets,
  set(next: AssetRef[]) {
    assets = next;
    emit();
  },
  add(asset: AssetRef) {
    if (!assets.some((a) => a.hash === asset.hash)) {
      assets = [...assets, asset];
      emit();
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useAssets = () => useSyncExternalStore(assetStore.subscribe, assetStore.get);

const toBase64 = (bytes: ArrayBuffer): string => {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** Uploads an image and registers it; returns its content hash. */
export async function uploadAsset(file: File): Promise<AssetRef> {
  const res = await fetch('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, mime: file.type, base64: toBase64(await file.arrayBuffer()) }),
  });
  const body = (await res.json()) as AssetRef & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `upload failed (${res.status})`);
  const asset: AssetRef = { hash: body.hash, mime: body.mime };
  assetStore.add(asset);
  return asset;
}
