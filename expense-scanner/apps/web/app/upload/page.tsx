import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { requireUser } from '@/lib/supabase';
import { callService } from '@/lib/services';
import { Submit } from '@/components/submit';

const MAX_BYTES = 10 * 1024 * 1024;

/** Detect type from magic bytes — never trust the browser-supplied MIME type. */
function sniff(buf: Uint8Array): { ext: string; mime: string } | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  const riff = String.fromCharCode(...buf.slice(0, 4)), webp = String.fromCharCode(...buf.slice(8, 12));
  if (riff === 'RIFF' && webp === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

async function upload(formData: FormData) {
  'use server';
  const { sb, user } = await requireUser();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) redirect('/upload?error=empty');
  if (file.size > MAX_BYTES) redirect('/upload?error=size');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) redirect('/upload?error=type');

  const { data: consent } = await sb.from('consents').select('granted').eq('purpose', 'ai_processing')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!consent?.granted) redirect('/settings/privacy?need=ai_processing');

  const id = randomUUID();
  const path = `${user.id}/${id}.${type.ext}`;
  const { error: upErr } = await sb.storage.from('receipts').upload(path, bytes, { contentType: type.mime, upsert: false });
  if (upErr) redirect('/upload?error=storage');
  const groupId = String(formData.get('group_id') ?? '') || null;
  const { error } = await sb.from('receipts').insert({ id, user_id: user.id, file_path: path, status: 'processing', group_id: groupId });
  if (error) redirect('/upload?error=db');

  try {
    await callService('ocr', '/process', user.id, { method: 'POST', body: { receipt_id: id } });
  } catch {
    /* receipt row is marked failed by the service; the detail page shows a retry */
  }
  redirect(`/receipts/${id}`);
}

const ERRORS: Record<string, string> = {
  empty: 'Please choose a photo.',
  size: 'The file is larger than 10 MB.',
  type: 'Only JPEG, PNG or WebP images are supported.',
  storage: 'Upload failed. Please try again.',
  db: 'Could not save the receipt. Please try again.',
};

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { sb } = await requireUser();
  const sp = await searchParams;
  const { data: groups } = await sb.from('groups').select('id, name').order('name');
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Scan a receipt</h1>
      {sp.error && <p className="flag">{ERRORS[sp.error] ?? 'Something went wrong.'}</p>}
      <form action={upload} className="card space-y-4">
        <div>
          <label className="label" htmlFor="file">Photo of receipt or bill</label>
          <input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="input" />
          <p className="mt-1 text-xs text-muted">Flat, well-lit, whole receipt in frame. Max 10 MB. Location data is removed.</p>
        </div>
        {!!groups?.length && (
          <div>
            <label className="label" htmlFor="group_id">Shared with group (optional)</label>
            <select id="group_id" name="group_id" className="input">
              <option value="">Just me</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        <Submit pending="Reading receipt…">Upload &amp; scan</Submit>
      </form>
    </div>
  );
}
