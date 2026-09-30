import { randomUUID } from 'node:crypto';
import { requireUser } from '@/lib/supabase';
import { callService } from '@/lib/services';
import { Submit } from '@/components/submit';
import { ReceiptPicker } from '@/components/receipt-picker';
import { done, fail, errorText } from '@/lib/flash';

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
  if (!(file instanceof File) || file.size === 0) fail('/upload', 'Please take or choose a photo first.');
  if (file.size > MAX_BYTES) fail('/upload', 'The photo is larger than 10 MB. Please choose a smaller one.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) fail('/upload', 'Only JPEG, PNG or WebP images are supported.');

  const { data: consent } = await sb.from('consents').select('granted').eq('purpose', 'ai_processing')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!consent?.granted) fail('/settings/privacy?need=ai_processing', 'Please allow AI receipt reading first.');

  const id = randomUUID();
  const path = `${user.id}/${id}.${type.ext}`;
  const { error: upErr } = await sb.storage.from('receipts').upload(path, bytes, { contentType: type.mime, upsert: false });
  if (upErr) fail('/upload', 'Upload failed. Please check your connection and try again.');
  const groupId = String(formData.get('group_id') ?? '') || null;
  const { error } = await sb.from('receipts').insert({ id, user_id: user.id, file_path: path, status: 'processing', group_id: groupId });
  if (error) fail('/upload', 'Could not save the receipt. Please try again.');

  let result: { is_flagged: boolean } | null = null;
  let problem: string | null = null;
  try {
    result = await callService<{ is_flagged: boolean }>('ocr', '/process', user.id, { method: 'POST', body: { receipt_id: id }, timeoutMs: 75_000 });
  } catch (e) {
    console.error('[upload]', e);
    problem = errorText(e, 'We saved your photo but could not read it yet. Tap Retry on the receipt.');
  }
  if (problem) fail(`/receipts/${id}`, problem);
  if (result?.is_flagged) done(`/receipts/${id}`, 'Receipt read — please check the highlighted fields.');
  done(`/receipts/${id}`, 'Receipt scanned and saved');
}

export default async function UploadPage() {
  const { sb } = await requireUser();
  const { data: groups } = await sb.from('groups').select('id, name').order('name');
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Add a receipt</h1>
      <form action={upload} className="space-y-4">
        <ReceiptPicker />
        {!!groups?.length && (
          <div>
            <label className="label" htmlFor="group_id">Shared with group (optional)</label>
            <select id="group_id" name="group_id" className="input">
              <option value="">Just me</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        <Submit className="btn w-full py-3" pending="Reading receipt… (about 5–10 s)">Upload &amp; read receipt</Submit>
      </form>
    </div>
  );
}
