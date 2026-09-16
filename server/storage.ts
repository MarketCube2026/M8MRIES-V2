import crypto from 'node:crypto';
import { HttpError } from './security.js';
export function validateFile(file: Express.Multer.File) {
  const b = file.buffer;
  const mime = b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg'
    : b.subarray(0,5).toString() === '%PDF-' ? 'application/pdf' : '';
  if (!mime || mime !== file.mimetype) throw new HttpError(415, '只支持内容与格式匹配的 PNG、JPG、PDF');
  return { mime, hash: crypto.createHash('sha256').update(b).digest('hex') };
}
export function storageClient(supabase: any, bucket: string) {
  return {
    async upload(key: string, bytes: Buffer, contentType: string) {
      const { error } = await supabase.storage.from(bucket).upload(key, bytes, { contentType, upsert: false });
      if (error) throw new HttpError(502, '附件存储失败，请检查 Storage 配置');
    },
    async download(key: string): Promise<Buffer> {
      const { data, error } = await supabase.storage.from(bucket).download(key);
      if (error) throw new HttpError(502, '附件读取失败');
      return Buffer.from(await data.arrayBuffer());
    },
    async signedUrl(key: string) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, 60);
      if (error) throw new HttpError(502, '无法获取附件链接');
      return data.signedUrl;
    },
  };
}
