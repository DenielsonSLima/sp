import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

const db = new PGlite();
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rpc = async (name, args) =>
  (await db.query(`select public.${name}(${args.map((_, index) => "$" + (index + 1)).join(",")}) result`, args)).rows[0]
    .result;
const migration = readFileSync(
  new URL("../migrations/20261102024909_flyer_write_validation.sql", import.meta.url),
  "utf8",
);
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create publication supabase_realtime;`);
  await db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  await db.exec(
    "alter table public.flyers add column library_metadata jsonb generated always as (data-'elements') stored",
  );
  await db.query("insert into auth.users values($1,$2),($3,$4)", [
    owner,
    "write-owner@example.com",
    other,
    "write-other@example.com",
  ]);
  const company = (await db.query("select sp_private.bootstrap_company('write-owner@example.com','Loja A') id")).rows[0]
    .id;
  const foreign = (await db.query("select sp_private.bootstrap_company('write-other@example.com','Loja B') id")).rows[0]
    .id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const design = {
    id: "large-art",
    title: "Cinco camadas",
    status: "draft",
    width: 1080,
    height: 1920,
    elements: [385700, 1816744, 1060580]
      .map((size, index) => ({
        id: "image-" + index,
        type: "image",
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        src: "data:image/png;base64," + randomBytes(size).toString("base64"),
      }))
      .concat([0, 1].map((index) => ({ id: "shape-" + index, type: "shape", x: 10, y: 10, width: 100, height: 100 }))),
  };
  await db.query("insert into public.flyers(company_id,id,data) values($1,$2,$3)", [company, design.id, design]);
  const explain = async () =>
    (
      await db.query(
        `explain (analyze,buffers,format json)
    select sp_private.validate_record(company_id,'flyers',data,data) from public.flyers where company_id=$1 and id=$2`,
        [company, design.id],
      )
    ).rows[0]["QUERY PLAN"][0];
  const before = await explain();
  const original = (
    await db.query(
      "select pg_get_functiondef('sp_private.validate_record(uuid,text,jsonb,jsonb)'::regprocedure) definition",
    )
  ).rows[0].definition;
  await db.exec(migration);
  const after = await explain();
  assert(before.Plan["Temp Written Blocks"] > 0, "the large original validator spills its materialized image array");
  assert.equal(after.Plan["Temp Written Blocks"], 0, "indexed element access avoids materializing the image array");
  const changed = (
    await db.query(
      "select pg_get_functiondef('sp_private.validate_record(uuid,text,jsonb,jsonb)'::regprocedure) definition",
    )
  ).rows[0].definition;
  assert.equal(
    changed.replace("\n if resource='flyers' then return sp_private.validate_flyer_record(input); end if;", ""),
    original,
    "the dispatch preserves the exact validator body for other resources",
  );
  await assert.rejects(() => db.exec(migration), /Versão inesperada/, "the patch refuses accidental reapplication");
  await db.exec("set role authenticated");
  const revision = async () =>
    (
      await db.query("select revision from public.resource_changes where company_id=$1 and resource='flyers'", [
        company,
      ])
    ).rows[0].revision;
  const beforeRevision = await revision();
  let ack = await rpc("sp_flyer_save", [
    company,
    { ...design, _version: 1, computed: "discard", action: "discard" },
    1,
  ]);
  assert.deepEqual(Object.keys(ack).sort(), ["id", "_version", "createdAt", "updatedAt"].sort());
  assert.equal(ack._version, 2);
  assert(Buffer.byteLength(JSON.stringify(ack)) < 250, "the response contains no images or elements");
  assert((await revision()) > beforeRevision, "the same resource signal invalidates readers");
  const read = await rpc("sp_get", [company, "flyers", design.id]);
  assert.deepEqual(read.elements, design.elements, "read-after-write retains every byte of each image and layer");
  assert(!Object.hasOwn(read, "computed"));
  assert(!Object.hasOwn(read, "action"));
  await assert.rejects(() => rpc("sp_flyer_save", [company, { ...design, title: "stale" }, 1]), /alterado/);
  await assert.rejects(() => rpc("sp_save", [company, "flyers", { ...design, title: "legacy stale" }, 1]), /alterado/);
  const legacy = await rpc("sp_save", [company, "flyers", { ...design, title: "legacy" }, 2]);
  assert.equal(legacy._version, 3);
  assert.deepEqual(legacy.elements, design.elements);
  ack = await rpc("sp_flyer_save", [company, { ...design, title: "compact again" }, 3]);
  assert.equal(ack._version, 4);
  await assert.rejects(() => rpc("sp_flyer_save", [foreign, design, null]), /não autorizado/);
  await assert.rejects(() => db.query("select sp_private.validate_flyer_record($1)", [design]), /permission denied/);
  const small = {
    id: "invalid",
    title: "Arte",
    status: "draft",
    width: 1080,
    height: 1080,
    elements: [{ type: "image", x: 0, y: 0, width: 10, height: 10, src: "data:image/png;base64,AAAA==" }],
  };
  const invalid = [
    { ...small, width: 319 },
    { ...small, height: 4097 },
    { ...small, width: 4096, height: 4096 },
    { ...small, width: null },
    { ...small, elements: {} },
    { ...small, elements: Array(201).fill(small.elements[0]) },
    ...[
      "javascript:alert(1)",
      "https://example.com/image.png",
      "data:image/svg+xml;base64,AAAA",
      "data:image/png;base64,A=A",
      "./assets/encartes/camadas/../x.png",
    ].map((src) => ({ ...small, elements: [{ ...small.elements[0], src }] })),
    ...[{ type: "unknown" }, { width: 0 }, { height: -1 }, { x: -1 }, { y: -1 }, { width: null }].map((patch) => ({
      ...small,
      elements: [{ ...small.elements[0], ...patch }],
    })),
    { ...small, padding: "A".repeat(26214400) },
  ];
  for (const document of invalid) {
    await assert.rejects(() => rpc("sp_flyer_save", [company, document, null]));
    await assert.rejects(() => rpc("sp_save", [company, "flyers", document, null]));
  }
  for (const [index, src] of [
    "./assets/logo-original.jpg",
    "./assets/encartes/camadas/natal-01.png",
    "data:image/webp;base64,AAAA=",
  ].entries()) {
    await rpc("sp_flyer_save", [
      company,
      { ...small, id: "allowed-" + index, elements: [{ ...small.elements[0], src }] },
      null,
    ]);
  }
  const empty = await rpc("sp_flyer_save", [company, { ...small, id: undefined, elements: [] }, null]);
  assert(empty.id);
  assert.equal(empty._version, 1);
  await db.exec("reset role");
  const audits = (
    await db.query(
      "select action,version from public.audit_log where company_id=$1 and resource='flyers' and record_id=$2 order by version",
      [company, design.id],
    )
  ).rows;
  assert.deepEqual(audits, [
    { action: "update", version: 2 },
    { action: "update", version: 3 },
    { action: "update", version: 4 },
  ]);
  await db.exec("set role anon");
  await assert.rejects(() => rpc("sp_flyer_save", [company, small, null]), /permission denied/);
  await db.exec("reset role");
  await db.query("update public.memberships set active=false where company_id=$1 and user_id=$2", [company, owner]);
  await db.exec("set role authenticated");
  await assert.rejects(() => rpc("sp_flyer_save", [company, small, null]), /não autorizado/);
  await db.exec("reset role");
  assert.equal(
    (await db.query("select relrowsecurity enabled from pg_class where oid='public.flyers'::regclass")).rows[0].enabled,
    true,
  );
  assert.equal(
    (await db.query("select has_table_privilege('authenticated','public.flyers','INSERT,UPDATE,DELETE') allowed"))
      .rows[0].allowed,
    false,
  );
  console.log(
    "LOCAL SYNTHETIC BENCHMARK:",
    JSON.stringify({
      documentBytes: Buffer.byteLength(JSON.stringify(design)),
      beforeExecutionMs: before["Execution Time"],
      afterExecutionMs: after["Execution Time"],
      beforeTempWrittenBlocks: before.Plan["Temp Written Blocks"],
      afterTempWrittenBlocks: after.Plan["Temp Written Blocks"],
      ackBytes: Buffer.byteLength(JSON.stringify(ack)),
    }),
  );
  console.log(
    "PASS: compact flyer save, exact image read-back, shared old/new version protection, authorization, validation parity, audit, signal and no validator temp spill.",
  );
} catch (error) {
  console.error(error.message, error.where || "", error.code || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
