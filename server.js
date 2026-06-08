import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: "understudy-holding-page" });
});

app.use("/api", (_req, res) => {
  res.status(410).json({
    error: "Deal Radar is currently private while Understudy is rebuilt."
  });
});

app.use(express.static(__dirname, { index: false }));

app.get(/.*/, (_req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Understudy holding page running at http://localhost:${port}`);
});
