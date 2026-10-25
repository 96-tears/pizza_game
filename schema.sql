-- Таблица лидеров: одна строка на игрока и игру. player_id — случайный id, который игра хранит в браузере.
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT    NOT NULL,              -- идентификатор игры, сейчас всегда '3d'
  player_id  TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,              -- заработано за карьеру, ₽
  level      INTEGER NOT NULL,              -- число выполненных рейсов
  created_at INTEGER NOT NULL,              -- unix-время в миллисекундах
  updated_at INTEGER NOT NULL,              -- когда поставлен текущий рекорд
  UNIQUE (game, player_id)
);
CREATE INDEX IF NOT EXISTS scores_top ON scores (game, score DESC, level DESC, updated_at ASC);

-- Отзывы из формы в игре.
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT,
  player_id  TEXT,
  name       TEXT,
  contact    TEXT,
  rating     INTEGER,                       -- 1..5 или NULL
  message    TEXT    NOT NULL DEFAULT '',
  context    TEXT,                          -- JSON: уровень, счёт, размер экрана, браузер
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_recent ON feedback (created_at DESC);
