# Марафон ЕГЭ — сервер

Многопользовательский план подготовки к ЕГЭ с авторизацией, таблицей рекордов и публичными профилями. Node.js + SQLite + Express.

## Что внутри

- Регистрация и вход по логину и паролю (bcrypt-хеш)
- Защита от брута: 5 неудачных попыток за сутки = блок аккаунта на 24 ч; 20 неудач за час с одного IP = блок IP на час
- Сессии в HttpOnly-cookie, действительны 30 дней
- Личное состояние (события, задачи, темы, методы, заметки, проблемы, цели) у каждого пользователя своё
- Пробники в отдельной таблице, можно выводить общую таблицу рекордов
- API для всех операций
- Калькулятор прогресса по темам, оценка остатка времени
- Публичные профили: чужие пользователи видят твой прогресс и пробники, но не приватные заметки

## Локально

```bash
npm install
npm start
```

Сервер поднимется на `http://localhost:3000`. База — SQLite-файл в `./data/marathon.db`. Удалишь — данные пропадут.

## Деплой на Railway

1. Сделай git-репо и запушь проект на GitHub.
2. На railway.app: New Project → Deploy from GitHub repo → выбери репо.
3. Railway сам определит Node-проект и запустит `npm install && npm start`.
4. **Важно — постоянный том для базы.** В настройках сервиса добавь Volume:
   - Mount path: `/app/data`
5. В Variables добавь:
   - `NODE_ENV=production`
   - `DATA_DIR=/app/data`
6. Дождись деплоя, открой публичный URL. Это твой адрес — отдавай другу.

Без тома SQLite-файл уйдёт при каждом перезапуске сервиса.

## Endpoints (вкратце)

| Метод | Путь | Что делает |
|---|---|---|
| POST | /api/register | { username, password, displayName } |
| POST | /api/login | { username, password } |
| POST | /api/logout | — |
| GET | /api/me | текущий пользователь + state + mocks |
| PUT | /api/state | сохранить state (events, tasks, todos, problems, goals) |
| PUT | /api/profile | { displayName?, bio?, isPublic? } |
| POST | /api/password | { current, next } |
| POST/PUT/DELETE | /api/mocks[/:id] | CRUD пробников |
| GET | /api/leaderboard?subject= | топ-100 по предмету или overall |
| GET | /api/users?q= | поиск пользователей |
| GET | /api/users/:username | публичный профиль |

## Безопасность

- Пароли хешированы bcrypt (10 раундов)
- Cookies httpOnly + sameSite=lax + secure в production
- Защита от брута на уровне аккаунта и IP
- Лимит на размер state — 4 МБ
- SQL только через prepared statements

## Структура

```
.
├── server.js          # Express + SQLite + auth + API
├── package.json
├── public/
│   └── index.html     # SPA: auth-экран и приложение
└── data/              # SQLite база (создаётся автоматически)
```
