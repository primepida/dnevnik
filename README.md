# Марафон ЕГЭ — сервер (v2, на Postgres)

Многопользовательский план подготовки к ЕГЭ. Node.js + Postgres + Express. Никаких Volume — данные в облачной БД.

## Что нужно сделать на Railway

### Шаг 1. Завести бесплатную базу

**Вариант A — Neon (рекомендую, навсегда бесплатно):**

1. Зайди на https://neon.tech, зарегистрируйся через GitHub.
2. Create Project → дай ему имя.
3. На главной странице проекта будет блок **Connection string** → нажми **Copy**. Это длинная строка вида `postgresql://user:password@ep-xxxx.us-east-1.aws.neon.tech/dbname?sslmode=require`.

**Вариант B — Railway Postgres** (кушает $5-кредит):

В проекте на Railway: ⌘K → **Database → PostgreSQL**. Railway сам подключит его к твоему сервису через переменную `DATABASE_URL`.

### Шаг 2. Прописать переменные в Railway

Открой свой сервис `dnevnik` → вкладка **Variables** → **+ New Variable**. Добавь:

```
DATABASE_URL = <строка подключения из Neon (если Neon)>
NODE_ENV     = production
ADMIN_USERNAME = <твой логин, в нижнем регистре>
```

Если ты выбрал Вариант B (Railway Postgres), `DATABASE_URL` появится сам.

`ADMIN_USERNAME` — это твой будущий логин. Зарегайся под ним первым, и ты получишь админ-права (сможешь удалять других пользователей).

### Шаг 3. Залить новые файлы

Замени в GitHub-репозитории старые `server.js` и `package.json` на новые из этого архива. Railway увидит push и сам передеплоит.

### Шаг 4. Проверить

Открой `https://<твой-домен>/api/health` — должно вернуть `{"status":"ok","db":true,"users":0,...}`. Это значит сервер видит базу.

Потом открой основной адрес — должен показаться экран входа. Зарегистрируйся.

## Что починено в v2

- **Cookie на Railway**: убрал флаг `secure`, который ломался в проксированной HTTPS-среде. Сессия теперь нормально сохраняется.
- **База в Postgres**: больше не нужен Volume, данные переживают любые редеплои.
- **`/api/health`**: диагностический эндпойнт, видит ли сервер базу.
- **Логи ошибок**: при падении регистрации/входа в Railway → Logs будет видна причина.

## Что добавлено в API

- `lastSeen` в каждом пользователе (обновляется на любой авторизованный запрос). Можно показать «онлайн / был N минут назад».
- `GET /api/leaderboard?type=topics&subject=…` — рейтинг по пройденным темам (раньше был только по пробникам).
- `GET /api/users/:username` теперь возвращает `taskProgress.{russian,math,informatics}.doneList` — список номеров и названий пройденных заданий.
- `DELETE /api/admin/users/:username` — удаление пользователя. Доступно только тому, чей логин совпадает с `ADMIN_USERNAME`.

Фронтенд для этих фич я добавлю в следующей версии — пока бэкенд их уже отдаёт, можешь дёргать вручную или через UI как есть.

## Локально

```bash
npm install
DATABASE_URL=postgresql://... ADMIN_USERNAME=test npm start
```

Открой http://localhost:3000.

## Endpoints

| Метод | Путь | Что |
|---|---|---|
| GET | /api/health | проверка БД |
| POST | /api/register | { username, password, displayName? } |
| POST | /api/login | { username, password } |
| POST | /api/logout | — |
| GET | /api/me | свой state + пробники |
| PUT | /api/state | сохранить state |
| PUT | /api/profile | { displayName?, bio?, isPublic? } |
| POST | /api/password | { current, next } |
| POST/PUT/DELETE | /api/mocks[/:id] | CRUD пробников |
| GET | /api/leaderboard?subject=&type= | type: mocks или topics |
| GET | /api/users?q= | поиск, отсортировано по last_seen |
| GET | /api/users/:username | публичный профиль + doneList |
| DELETE | /api/admin/users/:username | админ-удаление |

## Защита

- Пароли — bcrypt 10 раундов
- HttpOnly + SameSite=Lax cookie, 30 дней
- Брут: 5 фейлов = блок аккаунта 24ч; 20 фейлов с IP за час = блок IP на час
- 4 MB лимит на размер state, prepared statements везде

## Если что-то не так — что смотреть

1. Открой `/api/health` — если 500, значит проблема с подключением к Postgres. Проверь `DATABASE_URL`.
2. В Railway сервис → Logs — там будут ошибки сервера.
3. В браузере DevTools → Network — смотри что отвечает `/api/register` или `/api/login`.
