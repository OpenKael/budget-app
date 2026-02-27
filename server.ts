import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";

const PORT = 3334;
const DIR = import.meta.dir;
const db = new Database(join(DIR, "budget.db"));

// Init DB
db.run("PRAGMA journal_mode=WAL");
db.run(`
  CREATE TABLE IF NOT EXISTS months (
    id TEXT PRIMARY KEY,
    salary REAL DEFAULT 0
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_id TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('fixed', 'variable')),
    label TEXT NOT NULL,
    estimated REAL DEFAULT 0,
    actual REAL DEFAULT 0,
    FOREIGN KEY (month_id) REFERENCES months(id)
  )
`);

function ensureMonth(monthId: string) {
  const existing = db.query("SELECT id FROM months WHERE id = ?").get(monthId);
  if (!existing) {
    db.run("INSERT INTO months (id, salary) VALUES (?, 0)", [monthId]);
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

  const current = db.query("SELECT salary FROM months WHERE id = ?").get(monthId) as any;
  if (current && current.salary === 0) {
    db.run("UPDATE months SET salary = ? WHERE id = ?", [prev.salary, monthId]);
  }

  const currentExpenses = db.query("SELECT COUNT(*) as c FROM expenses WHERE month_id = ?").get(monthId) as any;
  if (currentExpenses.c === 0) {
    const prevExpenses = db.query("SELECT category, type, label, estimated FROM expenses WHERE month_id = ?").all(prevId);
    const insert = db.prepare("INSERT INTO expenses (month_id, category, type, label, estimated, actual) VALUES (?, ?, ?, ?, ?, 0)");
    for (const e of prevExpenses as any[]) {
      insert.run(monthId, e.category, e.type, e.label, e.estimated);
    }
  }
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

    // Static
    if (url.pathname === "/" || url.pathname === "/index.html") return serveFile("index.html", "text/html");
    if (url.pathname === "/app.js") return serveFile("app.js", "application/javascript");
    if (url.pathname === "/style.css") return serveFile("style.css", "text/css");

    // API: Get month data
    if (method === "GET" && url.pathname === "/api/month") {
      const monthId = url.searchParams.get("id");
      if (!monthId) return json({ error: "Missing month id" }, 400);
      ensureMonth(monthId);
      copyFromPreviousMonth(monthId);
      const month = db.query("SELECT * FROM months WHERE id = ?").get(monthId);
      const expenses = db.query("SELECT * FROM expenses WHERE month_id = ? ORDER BY type, category, label").all(monthId);
      return json({ month, expenses });
    }

    // API: Update salary
    if (method === "PUT" && url.pathname === "/api/salary") {
      const body = await req.json() as any;
      ensureMonth(body.month_id);
      db.run("UPDATE months SET salary = ? WHERE id = ?", [body.salary, body.month_id]);
      return json({ ok: true });
    }

    // API: Add expense
    if (method === "POST" && url.pathname === "/api/expense") {
      const body = await req.json() as any;
      ensureMonth(body.month_id);
      const result = db.run(
        "INSERT INTO expenses (month_id, category, type, label, estimated, actual) VALUES (?, ?, ?, ?, ?, ?)",
        [body.month_id, body.category, body.type, body.label, body.estimated || 0, body.actual || 0]
      );
      return json({ id: result.lastInsertRowid });
    }

    // API: Update expense
    if (method === "PUT" && url.pathname === "/api/expense") {
      const body = await req.json() as any;
      db.run(
        "UPDATE expenses SET category = ?, type = ?, label = ?, estimated = ?, actual = ? WHERE id = ?",
        [body.category, body.type, body.label, body.estimated, body.actual, body.id]
      );
      return json({ ok: true });
    }

    // API: Delete expense
    if (method === "DELETE" && url.pathname === "/api/expense") {
      const id = url.searchParams.get("id");
      db.run("DELETE FROM expenses WHERE id = ?", [id]);
      return json({ ok: true });
    }

    // API: History (all months)
    if (method === "GET" && url.pathname === "/api/history") {
      const months = db.query("SELECT * FROM months ORDER BY id DESC").all() as any[];
      const result = months.map((m: any) => {
        const expenses = db.query("SELECT * FROM expenses WHERE month_id = ?").all(m.id) as any[];
        const totalEstimated = expenses.reduce((s: number, e: any) => s + e.estimated, 0);
        const totalActual = expenses.reduce((s: number, e: any) => s + e.actual, 0);
        const fixedActual = expenses.filter((e: any) => e.type === "fixed").reduce((s: number, e: any) => s + e.actual, 0);
        const variableActual = expenses.filter((e: any) => e.type === "variable").reduce((s: number, e: any) => s + e.actual, 0);
        return {
          id: m.id,
          salary: m.salary,
          totalEstimated,
          totalActual,
          fixedActual,
          variableActual,
          balance: m.salary - totalActual,
          expenses
        };
      });
      return json(result);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`💰 Budget App running on http://localhost:${PORT}`);
