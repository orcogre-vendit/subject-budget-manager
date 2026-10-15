import "dotenv/config";
import { Pool, Client } from "pg";
import { dsqlPoolConfig, dsqlToken } from "../src/lib/db";
async function timed(label: string, fn: () => Promise<unknown>) {
  const t = Date.now();
  try { await fn(); console.log(label, "ok", Date.now() - t, "ms"); }
  catch (e) { console.log(label, "ERR", (e as Error).message, (e as {code?:string}).code, Date.now() - t, "ms"); }
}
async function main() {
  const base = dsqlPoolConfig();
  const token = await dsqlToken();
  // A: static token, 4 parallel
  await timed("A static-token pool x4", async () => {
    const pool = new Pool({ ...base, password: token, connectionTimeoutMillis: 30_000 });
    await Promise.all([1,2,3,4].map(() => pool.query("select 1"))); await pool.end();
  });
  // B: function token, 4 parallel
  await timed("B fn-token pool x4", async () => {
    const pool = new Pool({ ...base, connectionTimeoutMillis: 30_000 });
    await Promise.all([1,2,3,4].map(() => pool.query("select 1"))); await pool.end();
  });
  // C: 4 separate Clients with fn token in parallel
  await timed("C 4 clients fn-token parallel", async () => {
    const cs = [1,2,3,4].map(() => new Client({ ...base, connectionTimeoutMillis: 30_000 }));
    await Promise.all(cs.map((c) => c.connect())); await Promise.all(cs.map((c) => c.end()));
  });
  // D: 2 parallel with fn
  await timed("D fn-token pool x2", async () => {
    const pool = new Pool({ ...base, connectionTimeoutMillis: 30_000 });
    await Promise.all([1,2].map(() => pool.query("select 1"))); await pool.end();
  });
}
main();
