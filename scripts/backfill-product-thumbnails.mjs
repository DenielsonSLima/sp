/** Authorized maintenance: derive compact previews; never replace product/document originals. */
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
const env = { ...process.env }; delete env.SUPABASE_ACCESS_TOKEN;
const apply = process.argv.includes('--apply');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const scratch = await mkdtemp(path.join(tmpdir(), 'povo-product-thumbnails-'));
const evidenceDir = path.join(root, 'artifacts/system-performance-20261102');
const baseArgs = ['--profile', 'supabase', '--workdir', root, '--agent', 'no'];
async function query(sql) {
  const file = path.join(scratch, 'query.sql');
  await writeFile(file, sql, { mode: 0o600 });
  const response = await exec(cli, [...baseArgs, 'db', 'query', '--linked', '--output', 'json', '--file', file],
    { env, maxBuffer: 64 * 1024 * 1024 });
  const parsed = JSON.parse(response.stdout);
  return Array.isArray(parsed) ? parsed : parsed.rows;
}
async function applyBatch(prepared) {
  if (!prepared.length) return [];
  const input = JSON.stringify(prepared);
  return query(`begin;
    create temporary table thumbnail_results(result jsonb) on commit preserve rows;
    do $maintenance$ declare row jsonb; result jsonb; checked record;begin
      for row in select value from jsonb_array_elements(${quote(input)}::jsonb) loop
        begin
          perform set_config('request.jwt.claim.sub',row->>'owner',true);
          result:=public.sp_product_thumbnail_save((row->>'company')::uuid,row->>'id',(row->>'version')::bigint,row->>'preview');
          select md5(data::text) as document_hash,md5(preview_data_url) as preview_hash,version into checked
            from public.products where company_id=(row->>'company')::uuid and id=row->>'id';
          if checked.document_hash<>row->>'documentHash' or checked.preview_hash<>row->>'previewHash'
             or checked.version<>(row->>'version')::bigint+1 then raise exception 'Conferência da miniatura falhou.';end if;
          insert into thumbnail_results values(jsonb_build_object('id',row->>'id','applied',true,'version',checked.version,
            'documentHash',checked.document_hash,'previewHash',checked.preview_hash));
        exception when serialization_failure then
          insert into thumbnail_results values(jsonb_build_object('id',row->>'id','applied',false,'conflict',true));
        end;
      end loop;
    end $maintenance$;
    commit;
    select result from thumbnail_results;`);
}

try {
  if ((await readFile(path.join(root, 'supabase/.temp/project-ref'), 'utf8')).trim() !== projectRef)
    throw Error('Projeto Supabase diferente do autorizado.');
  const rows = await query(`select company_id,id,version,md5(data::text) document_hash,
    sp_private.product_photo_snapshot(data) source,
    (select user_id from public.memberships m where m.company_id=p.company_id and m.active and m.role='owner' limit 1) owner_id
    from public.products p where has_photos and preview_data_url is null order by company_id,id`);
  const prepared = [], evidence = [];
  for (const row of rows) {
    if (!row.owner_id) throw Error('Empresa sem proprietário ativo para autorizar a manutenção.');
    const asset = row.source.photoAssets?.[0];
    const original = path.join(scratch, 'original');
    await rm(original, { force: true });
    if (asset) {
      if (asset.bucket !== 'product-photos' || !asset.path.startsWith(`${row.company_id}/products/${row.id}/`) || asset.path.includes('..'))
        throw Error('Referência de foto fora do produto autorizado.');
      await exec(cli, [...baseArgs, 'storage', 'cp', `ss:///product-photos/${asset.path}`, original, '--experimental', '--linked'],
        { env, maxBuffer: 1024 * 1024 });
    } else {
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(row.source.photo || '')) throw Error('Fotografia original inválida.');
      await writeFile(original, Buffer.from(row.source.photo.split(',')[1], 'base64'), { mode: 0o600 });
    }
    const originalPixels = await readFile(original);
    const output = path.join(scratch, 'thumbnail.png');
    let pixels, preview;
    for (const size of [256, 192]) {
      await exec('/usr/bin/sips', ['-s', 'format', 'png', '-Z', String(size), original, '--out', output]);
      pixels = await readFile(output);
      preview = 'data:image/png;base64,' + pixels.toString('base64');
      if (preview.length <= 262144) break;
    }
    if (pixels.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || preview.length > 262144)
      throw Error('Miniatura fora do limite.');
    const width = pixels.readUInt32BE(16), height = pixels.readUInt32BE(20);
    if (width > 256 || height > 256) throw Error('Miniatura maior que 256 pixels.');
    prepared.push({ company: row.company_id, id: row.id, version: row.version, owner: row.owner_id,
      preview, documentHash: row.document_hash, previewHash: createHash('md5').update(preview).digest('hex') });
    evidence.push({ id: row.id, versionBefore: row.version, source: asset ? 'storage' : 'legacy',
      originalBytes: originalPixels.length, originalSha256: createHash('sha256').update(originalPixels).digest('hex'),
      documentHash: row.document_hash, previewBytes: preview.length, width, height });
    if (evidence.length % 10 === 0) console.log(JSON.stringify({ phase: 'prepared', count: evidence.length, total: rows.length }));
  }
  const results = [];
  if (apply) for (let index = 0; index < prepared.length; index += 10) {
    results.push(...(await applyBatch(prepared.slice(index, index + 10))).map(row => row.result));
    console.log(JSON.stringify({ phase: 'applied', count: results.length, total: prepared.length }));
  }
  await mkdir(evidenceDir, { recursive: true });
  const report = { projectRef, checkedAt: new Date().toISOString(), applied: apply, rows: evidence, results,
    originalBytes: evidence.reduce((sum, row) => sum + row.originalBytes, 0),
    previewBytes: evidence.reduce((sum, row) => sum + row.previewBytes, 0) };
  await writeFile(path.join(evidenceDir, apply ? 'product-thumbnail-backfill.json' : 'product-thumbnail-preparation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase: 'complete', count: evidence.length, applied: results.filter(row => row.applied).length,
    conflicts: results.filter(row => row.conflict).length, originalBytes: report.originalBytes, previewBytes: report.previewBytes }));
} finally { await rm(scratch, { recursive: true, force: true }); }
