import { FieldLabel } from '@puckeditor/core';
import type { CustomField } from '@puckeditor/core';
import { useRef, useState } from 'react';
import { uploadAsset, useAssets } from '../assets';

/** Picks one of the known images or uploads a new one; the value is the image's content hash. */
function AssetPicker({ name, value, onChange, field, allowNone }: { name: string; value: string; onChange: (v: string) => void; field: { label?: string }; allowNone: boolean }) {
  const assets = useAssets();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await uploadAsset(file);
      onChange(asset.hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <FieldLabel label={field.label ?? name}>
      <div className="pw-asset-field">
        <select value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value)}>
          <option value="" disabled={!allowNone}>
            {allowNone ? 'none' : 'pick an image…'}
          </option>
          {value && !assets.some((a) => a.hash === value) ? <option value={value}>{value} (not on this server)</option> : null}
          {assets.map((a) => (
            <option key={a.hash} value={a.hash}>
              {a.hash} ({a.mime === 'image/png' ? 'PNG' : 'JPEG'})
            </option>
          ))}
        </select>
        {value && assets.some((a) => a.hash === value) ? <img className="pw-asset-thumb" src={`/api/assets/${value}`} alt="" /> : null}
        <button type="button" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : 'Upload image…'}
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => void pick(e.currentTarget.files?.[0])} />
        {error ? <div className="pw-field-error">{error}</div> : null}
      </div>
    </FieldLabel>
  );
}

export const assetField = (label: string, allowNone = false): CustomField<string> => ({
  type: 'custom',
  label,
  render: ({ name, value, onChange, field }) => <AssetPicker name={name} value={value} onChange={onChange} field={field} allowNone={allowNone} />,
});
