-- Режим подзадач по умолчанию: «отмечать и добавлять свои».
-- у существующих задач «free» (бывший умолчательный) тоже сменяется; owner задачи может включить «можно всё» снова
UPDATE "tasks" SET "policy" = jsonb_set("policy", '{subtasks}', '"check_and_add"') WHERE "policy"->>'subtasks' = 'free';
