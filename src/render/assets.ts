import { PLACEHOLDER_IMAGE_ASSET } from '../core';
import { placeholderImageBytes } from './placeholder';

/**
 * The package never stores files. Templates reference opaque assetIds
 * (backgrounds, logos, custom fonts); the host resolves them to bytes.
 * The single exception is PLACEHOLDER_IMAGE_ASSET, served from inside.
 */
export interface AssetResolver {
  resolve(assetId: string): Promise<Uint8Array>;
}

export type AssetsInput = AssetResolver | Record<string, Uint8Array>;

export function toResolver(assets?: AssetsInput): AssetResolver {
  const host = toHostResolver(assets);
  return {
    async resolve(id) {
      // The bundled placeholder is the package's own asset: a host that never
      // uploaded one still gets a picture in empty product cells.
      if (id === PLACEHOLDER_IMAGE_ASSET) return placeholderImageBytes();
      return host.resolve(id);
    }
  };
}

function toHostResolver(assets?: AssetsInput): AssetResolver {
  if (!assets) {
    return {
      async resolve(id) {
        throw new Error(
          `Cannot resolve asset '${id}' — no assets were provided to renderPdf`
        );
      }
    };
  }
  if (typeof (assets as AssetResolver).resolve === 'function') {
    return assets as AssetResolver;
  }
  const record = assets as Record<string, Uint8Array>;
  return {
    async resolve(id) {
      const bytes = record[id];
      if (!bytes) throw new Error(`Asset '${id}' not found in provided assets`);
      return bytes;
    }
  };
}

/**
 * Convenience resolver fetching assets over HTTP (browser and Node ≥18).
 * Pass a base URL or a function mapping assetId → URL.
 */
export function urlAssetResolver(
  toUrl: string | ((assetId: string) => string)
): AssetResolver {
  return {
    async resolve(id) {
      const url =
        typeof toUrl === 'function'
          ? toUrl(id)
          : `${toUrl.replace(/\/$/, '')}/${encodeURIComponent(id)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch asset '${id}': HTTP ${res.status}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    }
  };
}
