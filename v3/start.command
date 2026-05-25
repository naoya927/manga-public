#!/bin/bash
# スクリプトがあるディレクトリに移動
cd "$(dirname "$0")"

# .env があれば読み込む
if [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

# Pythonサーバーを起動（ブラウザも自動で立ち上がります）
echo "サーバーを起動しています..."
if [ -z "$OPENAI_API_KEY" ]; then
  echo "警告: OPENAI_API_KEY が未設定です。AIの箇条書き生成は失敗します。"
fi
python3 server.py
