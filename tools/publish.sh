#!/bin/sh
# Заливает dist/ на сервер по rsync (нужен ssh-доступ). Куда — переменная PUBLISH_TARGET, например:
#   PUBLISH_TARGET=megalul@game.example.ru:/var/www/megalul npm run deploy
# На сервере папку отдаёт любой веб-сервер статики, примеры конфигов в deploy/.
set -e
cd "$(dirname "$0")/.."
[ -d dist ] || node tools/build.mjs
if [ -z "$PUBLISH_TARGET" ]; then echo "Укажите PUBLISH_TARGET=user@host:/path (куда класть dist/)"; exit 1; fi
rsync -az --delete dist/ "$PUBLISH_TARGET/"
echo "Опубликовано: $PUBLISH_TARGET"
