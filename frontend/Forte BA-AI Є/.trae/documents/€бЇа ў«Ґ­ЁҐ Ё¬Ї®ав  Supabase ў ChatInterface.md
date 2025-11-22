# План исправления ошибки импорта

## Диагностика
- Ошибка: `[plugin:vite:import-analysis] Failed to resolve import "@/integrations/supabase/client"`.
- Источник: `src/components/ChatInterface.tsx:6` — импорт `supabase` из `@/integrations/supabase/client`.
- Конфигурация алиаса корректна: `vite.config.ts:15` (`"@" -> ./src`).
- Фактический файл клиента: `src/integrations/client.ts:11` экспортирует `supabase`; пути `src/integrations/supabase/client.ts` не существует.

## Причина
- Неверный путь импорта: используется несуществующий подкаталог `supabase` внутри `src/integrations/`.

## Изменения
1. Обновить импорт в `src/components/ChatInterface.tsx`:
   - Было: `import { supabase } from "@/integrations/supabase/client"`
   - Стало: `import { supabase } from "@/integrations/client"`
2. (Опционально) скорректировать комментарий-подсказку в `src/integrations/client.ts`, чтобы он не предлагал путь с `supabase`.

## Проверка
- Запустить дев-сервер и убедиться, что оверлей Vite исчез:
  - `npm run dev` и открыть приложение.
- Быстрый прогон:
  - На экране чата отправить сообщение; в консоли не должно быть ошибок импорта.

## Дополнительно
- Убедиться, что заданы переменные окружения:
  - `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` в `.env.local`.
  - Без них вызов `supabase.functions.invoke("ba-assistant", ...)` может падать уже на сетевом уровне, но это отдельная от текущей ошибки проблема.

## Результат
- Импорт будет успешно резолвиться, страница перестанет падать на этапе анализа импортов, UI загрузится.