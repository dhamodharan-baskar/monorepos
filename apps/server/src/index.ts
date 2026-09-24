import express from "express";
import cors from "cors";
import moment from "moment";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: moment().format("YYYY-MM-DD HH:mm:ss") });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
