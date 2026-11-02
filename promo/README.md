# taskterm — промо-видео

Моушн-ролик «как пользоваться приложением» на [Motion Canvas](https://motioncanvas.io) (MIT). Это отдельный проект: он не входит в pnpm-workspace и не попадает в Docker-образ.

Готовое видео: `taskterm-promo.mp4` (1920×1080, 30 fps, ~110 с, голос + звуковые эффекты, без музыки).
Версия без звука: `taskterm-promo-silent.mp4`.

## Команды

```bash
cd promo
npm install
npm run dev                    # редактор с таймлайном: http://localhost:9000
node scripts/render.mjs taskterm-promo-silent.mp4   # рендер без звука + audio/marks.json
.venv-audio/bin/python audio/build.py --video taskterm-promo-silent.mp4 --out taskterm-promo.mp4
```

`render.mjs` открывает редактор в headless Chrome (нужен установленный Google Chrome), нажимает RENDER и забирает mp4. Перед запуском должен работать `npm run dev`. Параметры рендера (30 fps, экспорт через ffmpeg) лежат в `src/project.meta`.

Если `npm install` пишет про заблокированные postinstall-скрипты, дай бинарям ffmpeg право на запуск:

```bash
chmod u+x node_modules/@ffmpeg-installer/*/ffmpeg node_modules/@ffprobe-installer/*/ffprobe
```

## Структура

- `src/ui.tsx` — общий набор элементов (цвета темы phosphor, кнопки, поля, курсор, окно, подпись шага).
- `src/scenes/*.tsx` — сцены по порядку: `intro` → `login` → `boards` → `kanban` → `task` → `subtasks` → `realtime` → `customize` → `hotkeys` → `outro`.
- `src/project.ts` — порядок сцен.

Интерфейс в видео нарисован заново (не запись экрана), поэтому при изменении приложения сцены нужно править вручную.

## Озвучка и звук

Звук собирается отдельно от картинки и точно привязан к действиям на экране:

1. Во время рендера сцены вызывают `mark('click' | 'pop' | 'voice:login' …)` из `src/ui.tsx`. Метка хранит абсолютное время кадра; `render.mjs` сохраняет их в `audio/marks.json`.
2. `audio/build.py` по меткам строит дорожку:
   - **голос** — реплики из `audio/voice.json`, синтез macOS `say` (голос Milena, нужен macOS);
   - **эффекты** — синтезируются кодом в `audio/sfx.py` (клики, набор текста, «вуш», «поп», уведомление, перетаскивание…), внешних файлов нет;
   - **ducking** — пока говорит диктор, эффекты приглушаются; итог нормализуется до −16 LUFS и вшивается в mp4.
3. Музыки нет.

Окружение для аудио: `python3 -m venv .venv-audio && .venv-audio/bin/pip install numpy`.

Проверка таймингов реплик без сборки: `.venv-audio/bin/python audio/build.py --video taskterm-promo-silent.mp4 --report` (покажет наложения реплик). Если реплика не помещается, добавь `yield* waitFor(...)` в сцену и перерендери: метки пересчитаются сами.

Реплики лежат в `audio/voice.json` (английские слова записаны по-русски: «тасктерм», «докер компоуз ап» — так их лучше читает синтезатор).
