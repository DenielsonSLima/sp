/** Explicit, resumable bovine catalog import, confined to the authorized project/company. */
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectTransparentPng } from './import-product-storage.mjs';
import { createClient } from '@supabase/supabase-js';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'artifacts/bovino-catalogo-20261102');
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const cli = process.env.POVO_SUPABASE_CLI || '/private/tmp/povo-supabase-cli/supabase-go';
const project = 'enhoierfwuwtzulznjxa';
const company = '89d1d8c9-b03d-46aa-a743-deac900f93b3';
const env = { ...process.env };
delete env.SUPABASE_ACCESS_TOKEN;
const scratch = await mkdtemp(path.join(tmpdir(), 'povo-bovine-import-'));
const base = ['--profile', 'supabase', '--workdir', root, '--agent', 'no'];
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const json = value => quote(JSON.stringify(value)) + '::jsonb';
async function cliQuery(sql) {
  const file = path.join(scratch, randomUUID() + '.sql');
  await writeFile(file, sql, { mode: 0o600 });
  const { stdout } = await exec(cli, [...base, 'db', 'query', '--linked', '--output', 'json', '--file', file],
    { env, timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout);
}
let managementToken;
async function managementAuth() {
  // Reuse the same native credentials namespace/profile as the official Go CLI.
  // Keep the token in memory only; it must never enter logs, assets or the frontend.
  if (!managementToken) {
    const { stdout } = await exec('/usr/bin/security',
      ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'], { timeout: 10000 });
    managementToken = stdout.trim();
    if (!/^sbp_(oauth_)?[a-f0-9]{40}$/.test(managementToken)) throw Error('Sessão Supabase CLI não reconhecida.');
  }
  return managementToken;
}
async function runQuery(sql) {
  if (process.env.BOVINE_QUERY_TRANSPORT === 'cli') return cliQuery(sql);
  await managementAuth();
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + managementToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error('Consulta Supabase HTTP ' + response.status + ': ' + (await response.text()).slice(0, 800));
  return response.json();
}
let storageClientPromise;
function storageClient() {
  return storageClientPromise ||= (async () => {
    const token = await managementAuth();
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/api-keys`, {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error('Acesso administrativo ao Storage HTTP ' + response.status);
    const keys = await response.json();
    const key = keys.find(item => item.name === 'service_role' && item.type === 'legacy')?.api_key;
    if (!key?.startsWith('eyJ')) throw Error('Credencial de Storage indisponível.');
    // Server-side maintenance only: the key exists solely in this process memory.
    return createClient(`https://${project}.supabase.co`, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  })();
}
// Serialize SQL operations; the CLI fallback also rotates its temporary database login.
let queryQueue = Promise.resolve();
function query(sql) {
  const result = queryQueue.then(() => runQuery(sql));
  queryQueue = result.catch(() => {});
  return result;
}
const auth = `select user_id into owner_id from public.memberships
  where company_id=${quote(company)}::uuid and active and role='owner';
  if owner_id is null then raise exception 'Empresa sem proprietário ativo.'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);`;
async function catalog() {
  const plan = manifest.products.map(({ key, id, existingVersion, name, unit, group, sourceUrl, description }) =>
    ({ key, id, existingVersion, name, unit, group, sourceUrl, description }));
  const result = await query(`begin;
    create temporary table bovine_results(result jsonb) on commit preserve rows;
    do $import$ declare item jsonb; owner_id uuid; existing jsonb; record_version bigint; saved jsonb;
      category_id text; subcategory_id text; subproducts jsonb; model jsonb; model_version bigint;
      parts jsonb:='[]'; part jsonb; product_id text; entry record;
    begin
      ${auth}
      select id into category_id from public.product_categories where company_id=${quote(company)}::uuid
        and data->>'name'='AÇOUGUE' and nullif(data->>'parentId','') is null;
      if category_id is null then raise exception 'Categoria AÇOUGUE não encontrada.'; end if;
      select data||jsonb_build_object('id',id) into subproducts from public.product_categories
        where company_id=${quote(company)}::uuid and data->>'parentId'=category_id and data->>'name'='SUBPRODUTOS BOVINOS';
      if subproducts is null then
        subproducts:=public.sp_save(${quote(company)}::uuid,'product_categories',
          jsonb_build_object('name','SUBPRODUTOS BOVINOS','parentId',category_id),null);
      end if;
      for item in select value from jsonb_array_elements(${json(plan)}) loop
        existing:=null; record_version:=null;
        if nullif(item->>'id','') is not null then
          select data||jsonb_build_object('id',id),version into existing,record_version
            from public.products where company_id=${quote(company)}::uuid and id=item->>'id' for update;
          if existing is null then raise exception 'Produto existente removido: %',item->>'key'; end if;
          if record_version<>(item->>'existingVersion')::bigint then
            raise exception 'Produto alterado em outra sessão: %',item->>'key' using errcode='40001'; end if;
        else
          select data||jsonb_build_object('id',id),version into existing,record_version
            from public.products where company_id=${quote(company)}::uuid
              and (data->>'code'='BOV-'||upper(item->>'key') or data->>'name'=item->>'name') for update;
        end if;
        select id into subcategory_id from public.product_categories where company_id=${quote(company)}::uuid
          and data->>'parentId'=category_id and data->>'name'=case item->>'group'
            when 'miudos' then 'MIÚDOS BOVINOS' when 'subprodutos' then 'SUBPRODUTOS BOVINOS' else 'CARNES BOVINAS' end;
        if subcategory_id is null then raise exception 'Subcategoria ausente.'; end if;
        saved:=public.sp_save(${quote(company)}::uuid,'products',coalesce(existing,jsonb_build_object(
          'code','BOV-'||upper(item->>'key'),'photos','[]'::jsonb))||jsonb_build_object(
          'name',item->>'name','unit',item->>'unit','category','AÇOUGUE','categoryId',category_id,
          'subcategoryId',subcategory_id,'description',item->>'description','sourceUrl',item->>'sourceUrl'),record_version);
        insert into bovine_results values(jsonb_build_object('key',item->>'key','id',saved->>'id',
          'name',saved->>'name','unit',saved->>'unit','version',saved->'_version','group',item->>'group'));
      end loop;
      select data||jsonb_build_object('id',id),version into model,model_version from public.butcher_models
        where company_id=${quote(company)}::uuid and id=${quote(manifest.modelId)} for update;
      if model is null or model->>'species'<>'bovine' then raise exception 'Modelo bovino não encontrado.'; end if;
      for part in select value from jsonb_array_elements(model->'parts') loop
        parts:=parts||jsonb_build_array(part||jsonb_build_object('percent',
          coalesce(((part->>'percentBps')::numeric/100)::text,'')));
      end loop;
      for entry in select result from bovine_results loop
        product_id:=entry.result->>'id';
        if not exists(select 1 from jsonb_array_elements(parts) p where p->>'productId'=product_id) then
          parts:=parts||jsonb_build_array(jsonb_build_object('productId',product_id,'percent','',
            'quantityPerAnimal','','active',true));
        end if;
      end loop;
      saved:=public.sp_save(${quote(company)}::uuid,'butcher_models',model||jsonb_build_object('parts',parts),model_version);
      insert into bovine_results values(jsonb_build_object('modelId',saved->>'id','name',saved->>'name',
        'parts',jsonb_array_length(saved->'parts'),'version',saved->'_version','ready',saved->'ready'));
    end $import$;
    commit;
    select result from bovine_results;`);
  await writeFile(path.join(directory, 'catalog-applied.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ phase: 'catalog', products: result.length - 1, model: result.at(-1).result }));
}
async function photos() {
  const applied = JSON.parse(await readFile(path.join(directory, 'catalog-applied.json'), 'utf8'));
  const assigned = new Map(applied.filter(row => row.result.key).map(row => [row.result.key, row.result]));
  const selectedKeys = new Set((process.env.BOVINE_ONLY_KEYS || process.env.BOVINE_ONLY_KEY || '').split(',').filter(Boolean));
  const approved = new Set(JSON.parse(await readFile(path.join(directory, 'visual-approved.json'), 'utf8')));
  const selected = manifest.products.filter(product => approved.has(product.key) && (!selectedKeys.size || selectedKeys.has(product.key))
    && (!process.argv.includes('--available') || (product.photos.every(photo => existsSync(photo.file))
      && !existsSync(path.join(directory, 'verification', product.key + '.json')))));
  const assetsByKey = new Map();
  for (const product of selected) {
    const record = assigned.get(product.key);
    if (!record) throw Error('Produto ainda não cadastrado: ' + product.key);
    const assets = [];
    for (const photo of product.photos) {
      const bytes = await readFile(photo.file);
      const dimensions = inspectTransparentPng(bytes);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      assets.push({ ...photo, bucket: 'product-photos', path: `${company}/products/${record.id}/${sha256}.png`,
        sha256, mimeType: 'image/png', size: bytes.length, width: dimensions.width, height: dimensions.height });
    }
    if (new Set(assets.map(asset => asset.sha256)).size !== 3) throw Error('Fotos repetidas: ' + product.key);
    assetsByKey.set(product.key, assets);
  }
  if (!selected.length) return;
  const paths = [...assetsByKey.values()].flat().map(asset => quote(asset.path));
  const existing = await query(`select name from storage.objects where bucket_id='product-photos'
    and name in (${paths.join(',')})`);
  const stored = new Set(existing.map(row => row.name));
  const importProduct = async (product) => {
    const record = assigned.get(product.key);
    const assets = assetsByKey.get(product.key);
    const storage = (await storageClient()).storage.from('product-photos');
    for (const asset of assets) {
      if (!stored.has(asset.path)) {
        const { error } = await storage.upload(asset.path, await readFile(asset.file), { contentType: 'image/png', upsert: false });
        if (error) throw Error('Upload ' + product.key + '/' + asset.angle + ': ' + error.message);
      }
      const { data, error } = await storage.download(asset.path);
      if (error) throw Error('Download ' + product.key + '/' + asset.angle + ': ' + error.message);
      const remote = Buffer.from(await data.arrayBuffer());
      if (createHash('sha256').update(remote).digest('hex') !== asset.sha256) throw Error('Hash remoto incorreto.');
    }
    const refs = assets.map(({ bucket, path: objectPath, mimeType, size, width, height, angle, source }, position) =>
      ({ bucket, path: objectPath, mimeType, size, width, height, angle, source, position }));
    const thumbnailFile = path.join(scratch, product.key + '-preview.png');
    await exec('/usr/bin/sips', ['-Z', '192', product.photos[0].file, '--out', thumbnailFile]);
    const preview = 'data:image/png;base64,' + (await readFile(thumbnailFile)).toString('base64');
    if (preview.length > 131072) throw Error('Miniatura grande demais.');
    const saved = await query(`begin;
      create temporary table gallery_result(result jsonb) on commit preserve rows;
      do $gallery$ declare owner_id uuid; old jsonb; current_version bigint; saved jsonb; thumbnail jsonb; asset jsonb; combined jsonb;
      begin
        ${auth}
        select data,version into old,current_version from public.products where company_id=${quote(company)}::uuid
          and id=${quote(record.id)} for update;
        if old is null then raise exception 'Produto removido.'; end if;
        combined:=coalesce(old->'photoAssets','[]');
        for asset in select value from jsonb_array_elements(${json(refs)}) loop
          if not exists(select 1 from jsonb_array_elements(combined) p where p->>'path'=asset->>'path') then
            combined:=combined||jsonb_build_array(asset||jsonb_build_object('position',jsonb_array_length(combined)+jsonb_array_length(coalesce(old->'photos','[]'))));
          end if;
        end loop;
        if jsonb_array_length(combined)+jsonb_array_length(coalesce(old->'photos','[]'))>5 then
          raise exception 'Galeria alterada: não substituir fotos existentes.'; end if;
        saved:=public.sp_product_gallery(${quote(company)}::uuid,${quote(record.id)},combined,
          coalesce(old->'photos','[]'),current_version);
        thumbnail:=public.sp_product_thumbnail_save(${quote(company)}::uuid,${quote(record.id)},
          (saved->>'_version')::bigint,${quote(preview)});
        insert into gallery_result values(jsonb_build_object('id',saved->>'id','name',saved->>'name',
          'version',saved->'_version','photos',jsonb_array_length(saved->'photoAssets'),'thumbnail',thumbnail));
      end $gallery$;
      commit; select result from gallery_result;`);
    await mkdir(path.join(directory, 'verification'), { recursive: true });
    await writeFile(path.join(directory, 'verification', product.key + '.json'), JSON.stringify({
      key: product.key, ...saved[0].result, assets: assets.map(({ file, path: objectPath, sha256, size, width, height, angle }) =>
        ({ file, path: objectPath, sha256, size, width, height, angle, downloadedHashVerified: true })),
    }, null, 2));
    console.log(JSON.stringify({ phase: 'photos', key: product.key, verified: 3, result: saved[0].result }));
  };
  let index = 0;
  const workers = Array.from({ length: Math.min(4, selected.length) }, async () => {
    while (index < selected.length) await importProduct(selected[index++]);
  });
  const results = await Promise.allSettled(workers);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
}

async function verify() {
  const applied = JSON.parse(await readFile(path.join(directory, 'catalog-applied.json'), 'utf8'));
  const assigned = new Map(applied.filter(row => row.result.key).map(row => [row.result.key, row.result]));
  const plan = [];
  for (const product of manifest.products) {
    const proof = JSON.parse(await readFile(path.join(directory, 'verification', product.key + '.json'), 'utf8'));
    if (proof.assets.length !== 3 || !proof.assets.every(asset => asset.downloadedHashVerified)) {
      throw Error('Galeria ainda não verificada: ' + product.key);
    }
    for (const photo of product.photos) {
      const bytes = await readFile(photo.file);
      inspectTransparentPng(bytes);
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (!proof.assets.some(asset => asset.angle === photo.angle && asset.sha256 === hash)) {
        throw Error('Arquivo alterado depois da verificação: ' + photo.file);
      }
    }
    plan.push({ key: product.key, id: assigned.get(product.key).id, name: product.name, unit: product.unit,
      paths: proof.assets.map(asset => asset.path) });
  }
  const result = await query(`with expected as (select value e from jsonb_array_elements(${json(plan)})),
    records as (select e,p.data,p.version,p.preview_data_url,p.preview_source_hash from expected
      left join public.products p on p.id=e->>'id' and p.company_id=${quote(company)}::uuid)
    select jsonb_build_object('projectRef',${quote(project)},'companyId',${quote(company)},
      'products',(select jsonb_agg(jsonb_build_object('key',e->>'key','id',e->>'id','name',data->>'name',
        'unit',data->>'unit','version',version,'metadataMatches',data->>'name'=e->>'name' and data->>'unit'=e->>'unit',
        'photos',jsonb_array_length(coalesce(data->'photoAssets','[]')),
        'legacyPhotos',jsonb_array_length(coalesce(data->'photos','[]')),
        'thumbnail',preview_data_url is not null,
        'thumbnailFresh',preview_source_hash=md5(sp_private.product_photo_snapshot(data)::text),
        'expectedStorageObjects',(select count(*) from storage.objects s where s.bucket_id='product-photos'
          and s.name in (select jsonb_array_elements_text(e->'paths'))),
        'assetPathsMatch',(select array_agg(p->>'path' order by p->>'path') from jsonb_array_elements(data->'photoAssets') p)
          =(select array_agg(v order by v) from jsonb_array_elements_text(e->'paths') v))) from records),
      'model',(select data||jsonb_build_object('_version',version) from public.butcher_models
        where company_id=${quote(company)}::uuid and id=${quote(manifest.modelId)}),
      'privateBucket',(select not public from storage.buckets where id='product-photos'),
      'rls',(select jsonb_object_agg(relname,relrowsecurity) from pg_class where oid in
        ('public.products'::regclass,'public.butcher_models'::regclass)),
      'realtime',(select jsonb_agg(resource) from public.resource_changes where company_id=${quote(company)}::uuid
        and resource in ('products','butcher_models')),
      'checkedAt',now()) result;`);
  const evidence = result[0].result;
  await writeFile(path.join(directory, 'final-verification.json'), JSON.stringify(evidence, null, 2));
  const expectedById = new Map(plan.map(item => [item.id, item]));
  const parts = evidence.model.parts;
  if (evidence.products.length !== 33 || !evidence.privateBucket ||
      evidence.products.some(p => !p.metadataMatches || p.photos !== 3 || p.legacyPhotos !== 0 ||
        !p.thumbnail || !p.thumbnailFresh || !p.assetPathsMatch || p.expectedStorageObjects !== 3) ||
      parts.length !== 33 || new Set(parts.map(part => part.productId)).size !== 33 ||
      parts.some(part => {
        const expected = expectedById.get(part.productId);
        const percentEmpty = part.unit === 'UN' ? part.percentBps === 0 : part.percentBps === null;
        return !expected || part.unit !== expected.unit || part.name !== expected.name || !percentEmpty || part.quantityPerAnimal !== null;
      }) ||
      !Object.values(evidence.rls).every(Boolean)) throw Error('Conferência remota divergente; consulte final-verification.json.');
  console.log(JSON.stringify({ phase: 'verified', products: 33, images: 99, modelParts: parts.length,
    modelVersion: evidence.model._version, privateBucket: evidence.privateBucket, checkedAt: evidence.checkedAt }));
}

try {
  if (manifest.projectRef !== project || manifest.companyId !== company ||
      (await readFile(path.join(root, 'supabase/.temp/project-ref'), 'utf8')).trim() !== project) throw Error('Projeto/empresa não autorizados.');
  if (process.argv.includes('--catalog')) await catalog();
  else if (process.argv.includes('--photos')) await photos();
  else if (process.argv.includes('--verify')) await verify();
  else console.log('Use --catalog, --photos ou --verify; BOVINE_ONLY_KEY permite retomar uma galeria.');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
