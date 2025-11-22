import axios from "axios";

async function run() {
  const payload = {
    inputFormat: "json",
    data: {
      title: "Тест",
      description: "Описание",
      actors: ["Пользователь"],
      processSteps: ["Шаг1", "Шаг2"],
      functionalRequirements: ["Регистрация"],
      successMetrics: ["Время обработки < 2 мин"]
    },
    options: { returnZip: true }
  };
  const r = await axios.post("http://localhost:3000/generate", payload);
  const d = r.data;
  console.log(JSON.stringify({ ok: d.ok, files: d.files?.length || 0, zip: !!d.zip, missing: d.missingFields?.length || 0 }, null, 2));
}

run().catch(e => { console.error(e?.message || String(e)); process.exit(1); });