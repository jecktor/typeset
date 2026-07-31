import { useEffect, useRef, useState } from 'react';
import { toResolver, type AssetsInput } from '../render';

/**
 * Resolve an assetId to an object URL for display (background PDFs, images).
 * URLs are cached per hook instance and revoked on unmount.
 */
export function useAssetUrl(
  assets: AssetsInput | undefined,
  assetId: string | undefined
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const cache = useRef(new Map<string, string>());

  useEffect(() => {
    const urls = cache.current;
    return () => {
      for (const u of urls.values()) URL.revokeObjectURL(u);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    const cached = cache.current.get(assetId);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    toResolver(assets)
      .resolve(assetId)
      .then(bytes => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer])
        );
        cache.current.set(assetId, objectUrl);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assets, assetId]);

  return url;
}
