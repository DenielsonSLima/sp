/** Explicit maintenance: derive thumbnails from authorized originals without modifying their bytes. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const projectRef = 'enhoierfwuwtzulznjxa';
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = process.env.POVO_SUPABASE_CLI || '/private/tmp/supermercado-supabase-cli/supabase-go';
const env = { ...process.env };
delete env.SUPABASE_ACCESS_TOKEN;
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const apply = process.argv.includes('--apply');
const scratch = await mkdtemp(path.join(tmpdir(), 'povo-brand-previews-'));
const evidenceDir = path.join(root, 'artifacts/brand-previews-20261102');
async function query(sql) {
  const file = path.join(scratch, 'query.sql');
  await writeFile(file, sql, { mode: 0o600 });
  const result = await exec(cli, ['--profile', 'supabase', '--workdir', root, 'db', 'query', '--linked',
    '--agent', 'no', '--output', 'json', '--file', file], { env, maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(result.stdout);
}
try {
  if ((await readFile(path.join(root, 'supabase/.temp/project-ref'), 'utf8')).trim() !== projectRef)
    throw Error('Projeto Supabase diferente do autorizado.');
  const rows = await query(`select a.company_id, a.id, a.version, a.metadata->>'name' as name,
    md5((a.data - 'previewDataURL')::text) as original_document_hash, md5(a.data->>'dataURL') as original_png_hash,
    octet_length(a.data->>'dataURL') as original_bytes, octet_length(a.preview_data_url) as preview_bytes,
    (select user_id from public.memberships m where m.company_id=a.company_id and m.active and m.role='owner' limit 1) as owner_id
    from public.brand_assets a order by a.company_id, a.id`);
  const results = [];
  for (const row of rows) {
    if (row.preview_bytes) {
      results.push({ id: row.id, name: row.name, skipped: true, originalBytes: row.original_bytes, previewBytes: row.preview_bytes });
      continue;
    }
    if (!row.owner_id) throw Error('Empresa sem proprietário ativo para autorizar a manutenção.');
    const source = (await query(`select data->>'dataURL' as src from public.brand_assets
      where company_id=${quote(row.company_id)} and id=${quote(row.id)} and version=${row.version}`))[0]?.src;
    if (!source || createHash('md5').update(source).digest('hex') !== row.original_png_hash)
      throw Error('PNG alterado durante a preparação. Execute novamente.');
    const original = path.join(scratch, 'original.png');
    const thumbnail = path.join(scratch, 'preview.png');
    await writeFile(original, Buffer.from(source.split(',')[1], 'base64'), { mode: 0o600 });
    await exec('/usr/bin/sips', ['-Z', '384', original, '--out', thumbnail]);
    const pixels = await readFile(thumbnail);
    if (pixels.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw Error('Prévia não é PNG.');
    const width = pixels.readUInt32BE(16), height = pixels.readUInt32BE(20);
    const preview = 'data:image/png;base64,' + pixels.toString('base64');
    if (width > 384 || height > 384 || preview.length > 524288) throw Error('Prévia excede o limite.');
    if (apply) {
      await query(`begin;
        select set_config('request.jwt.claim.sub', ${quote(row.owner_id)}, true);
        select public.sp_brand_asset_preview_save(${quote(row.company_id)}, ${quote(row.id)}, ${row.version}, ${quote(preview)});
        commit;`);
      const checked = (await query(`select version, md5((data - 'previewDataURL')::text) as document_hash, md5(data->>'dataURL') as png_hash,
        md5(preview_data_url) as preview_hash from public.brand_assets
        where company_id=${quote(row.company_id)} and id=${quote(row.id)}`))[0];
      if (checked.document_hash !== row.original_document_hash || checked.png_hash !== row.original_png_hash ||
          checked.preview_hash !== createHash('md5').update(preview).digest('hex') || checked.version !== row.version + 1)
        throw Error('A conferência do PNG ou da versão não corresponde ao esperado.');
    }
    const result = { id: row.id, name: row.name, originalBytes: row.original_bytes, previewBytes: preview.length,
      width, height, originalDocumentHash: row.original_document_hash, originalPngHash: row.original_png_hash, applied: apply };
    results.push(result);
    console.log(JSON.stringify({ phase: apply ? 'verified' : 'prepared', ...result }));
  }
  await mkdir(evidenceDir, { recursive: true });
  const evidence = { projectRef, at: new Date().toISOString(), applied: apply, rows: results,
    originalBytes: results.reduce((sum, row) => sum + row.originalBytes, 0),
    previewBytes: results.reduce((sum, row) => sum + row.previewBytes, 0) };
  await writeFile(path.join(evidenceDir, apply ? 'backfill-verification.json' : 'backfill-preparation.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ phase: 'complete', originalBytes: evidence.originalBytes, previewBytes: evidence.previewBytes, count: results.length, applied: apply }));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
