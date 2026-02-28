import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";

const PORT = 3334;
const DIR = import.meta.dir;
const db = new Database(join(DIR, "budget.db"));

db.run("PRAGMA journal_mode=WAL");

// Migration: add couple columns
db.run(`CREATE TABLE IF NOT EXISTS months (
  id TEXT PRIMARY KEY,
  salary REAL DEFAULT 0,
  salary_p2 REAL DEFAULT 0,
  name_p1 TEXT DEFAULT 'Personne 1',
  name_p2 TEXT DEFAULT 'Personne 2'
)`);

// Add new columns if upgrading from old schema
try { db.run("ALTER TABLE months ADD COLUMN salary_p2 REAL DEFAULT 0"); } catch {}
try { db.run("ALTER TABLE months ADD COLUMN name_p1 TEXT DEFAULT 'Personne 1'"); } catch {}
try { db.run("ALTER TABLE months ADD COLUMN name_p2 TEXT DEFAULT 'Personne 2'"); } catch {}

db.run(`CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month_id TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('fixed', 'variable')),
  label TEXT NOT NULL,
  estimated REAL DEFAULT 0,
  actual REAL DEFAULT 0,
  split_p1 REAL DEFAULT -1,
  FOREIGN KEY (month_id) REFERENCES months(id)
)`);

try { db.run("ALTER TABLE expenses ADD COLUMN split_p1 REAL DEFAULT -1"); } catch {}

function ensureMonth(monthId: string) {
  const existing = db.query("SELECT id FROM months WHERE id = ?").get(monthId);
  if (!existing) {
    db.run("INSERT INTO months (id, salary, salary_p2, name_p1, name_p2) VALUES (?, 0, 0, 'Personne 1', 'Personne 2')", [monthId]);
  }
}

function copyFromPreviousMonth(monthId: string) {
  const [year, month] = monthId.split("-").map(Number);
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  const prevId = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  const prev = db.query("SELECT * FROM months WHERE id = ?").get(prevId) as any;
  if (!prev) return;

  const current = db.query("SELECT salary, salary_p2 FROM months WHERE id = ?").get(monthId) as any;
  if (current && current.salary === 0 && current.salary_p2 === 0) {
    db.run("UPDATE months SET salary = ?, salary_p2 = ?, name_p1 = ?, name_p2 = ? WHERE id = ?",
      [prev.salary, prev.salary_p2, prev.name_p1, prev.name_p2, monthId]);
  }

  const currentExpenses = db.query("SELECT COUNT(*) as c FROM expenses WHERE month_id = ?").get(monthId) as any;
  if (currentExpenses.c === 0) {
    const prevExpenses = db.query("SELECT category, type, label, estimated, split_p1 FROM expenses WHERE month_id = ?").all(prevId);
    const insert = db.prepare("INSERT INTO expenses (month_id, category, type, label, estimated, actual, split_p1) VALUES (?, ?, ?, ?, ?, 0, ?)");
    for (const e of prevExpenses as any[]) {
      insert.run(monthId, e.category, e.type, e.label, e.estimated, e.split_p1);
    }
  }
}

function getProrata(month: any): number {
  const s1 = month.salary || 0;
  const s2 = month.salary_p2 || 0;
  const total = s1 + s2;
  if (total === 0) return 50;
  return Math.round((s1 / total) * 100 * 10) / 10;
}

function serveFile(path: string, contentType: string) {
  try {
    return new Response(readFileSync(join(DIR, path)), { headers: { "Content-Type": contentType } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    if (url.pathname === "/" || url.pathname === "/index.html") return serveFile("index.html", "text/html");
    if (url.pathname === "/app.js") return serveFile("app.js", "application/javascript");
    if (url.pathname === "/style.css") return serveFile("style.css", "text/css");

    // GET month
    if (method === "GET" && url.pathname === "/api/month") {
      const monthId = url.searchParams.get("id");
      if (!monthId) return json({ error: "Missing month id" }, 400);
      ensureMonth(monthId);
      copyFromPreviousMonth(monthId);
      const month = db.query("SELECT * FROM months WHERE id = ?").get(monthId) as any;
      const expenses = db.query("SELECT * FROM expenses WHERE month_id = ? ORDER BY type, category, label").all(monthId);
      const prorata = getProrata(month);
      return json({ month, expenses, prorata });
    }

    // PUT salary
    if (method === "PUT" && url.pathname === "/api/salary") {
      const body = await req.json() as any;
      ensureMonth(body.month_id);
      db.run("UPDATE months SET salary = ?, salary_p2 = ?, name_p1 = ?, name_p2 = ? WHERE id = ?",
        [body.salary ?? 0, body.salary_p2 ?? 0, body.name_p1 ?? 'Personne 1', body.name_p2 ?? 'Personne 2', body.month_id]);
      return json({ ok: true });
    }

    // POST expense
    if (method === "POST" && url.pathname === "/api/expense") {
      const body = await req.json() as any;
      ensureMonth(body.month_id);
      const result = db.run(
        "INSERT INTO expenses (month_id, category, type, label, estimated, actual, split_p1) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [body.month_id, body.category, body.type, body.label, body.estimated || 0, body.actual || 0, body.split_p1 ?? -1]
      );
      return json({ id: result.lastInsertRowid });
    }

    // PUT expense
    if (method === "PUT" && url.pathname === "/api/expense") {
      const body = await req.json() as any;
      db.run(
        "UPDATE expenses SET category = ?, type = ?, label = ?, estimated = ?, actual = ?, split_p1 = ? WHERE id = ?",
        [body.category, body.type, body.label, body.estimated, body.actual, body.split_p1 ?? -1, body.id]
      );
      return json({ ok: true });
    }

    // DELETE expense
    if (method === "DELETE" && url.pathname === "/api/expense") {
      const id = url.searchParams.get("id");
      db.run("DELETE FROM expenses WHERE id = ?", [id]);
      return json({ ok: true });
    }

    // GET history
    if (method === "GET" && url.pathname === "/api/history") {
      const months = db.query("SELECT * FROM months ORDER BY id DESC").all() as any[];
      const result = months.map((m: any) => {
        const expenses = db.query("SELECT * FROM expenses WHERE month_id = ?").all(m.id) as any[];
        const prorata = getProrata(m);
        const totalEstimated = expenses.reduce((s: number, e: any) => s + e.estimated, 0);
        const totalActual = expenses.reduce((s: number, e: any) => s + e.actual, 0);
        const fixedActual = expenses.filter((e: any) => e.type === "fixed").reduce((s: number, e: any) => s + e.actual, 0);
        const variableActual = expenses.filter((e: any) => e.type === "variable").reduce((s: number, e: any) => s + e.actual, 0);
        let p1Total = 0, p2Total = 0;
        expenses.forEach((e: any) => {
          const sp = e.split_p1 < 0 ? prorata : e.split_p1;
          p1Total += e.actual * sp / 100;
          p2Total += e.actual * (100 - sp) / 100;
        });
        return {
          id: m.id, salary: m.salary, salary_p2: m.salary_p2,
          name_p1: m.name_p1, name_p2: m.name_p2,
          totalEstimated, totalActual, fixedActual, variableActual,
          balance: (m.salary + m.salary_p2) - totalActual,
          p1Total: Math.round(p1Total * 100) / 100,
          p2Total: Math.round(p2Total * 100) / 100,
          balance_p1: Math.round((m.salary - p1Total) * 100) / 100,
          balance_p2: Math.round(((m.salary_p2 || 0) - p2Total) * 100) / 100,
          expenses
        };
      });
      return json(result);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`💰 Budget App running on http://localhost:${PORT}`);
