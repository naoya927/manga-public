import http.server
import socketserver
import socket
import json
import os
import re
import base64
from datetime import datetime
import threading
import webbrowser
import urllib.request
import urllib.parse
import urllib.error

PORT = 8000
MD_FILE = "opinion.md"
CALENDAR_FILE = "calendar_entries.json"
IMG_DIR = "images"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini").strip()
OPENAI_API_BASE = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")

if not os.path.exists(IMG_DIR):
    os.makedirs(IMG_DIR)


def parse_records():
    """opinion.md を読み込んで (rawブロック文字列, 解析済み辞書) のリストを返す"""
    records = []
    if os.path.exists(MD_FILE):
        with open(MD_FILE, "r", encoding="utf-8") as f:
            content = f.read()
            blocks = content.split("---")
            for block in blocks:
                block_stripped = block.strip()
                if not block_stripped:
                    continue

                title_match = re.search(r'^##\s+(.*)', block_stripped, re.MULTILINE)
                reading_match = re.search(r'^- \*\*よみがな:\*\*\s*(.*)', block_stripped, re.MULTILINE)
                date_match = re.search(r'^- \*\*日時:\*\*\s*(.*)', block_stripped, re.MULTILINE)
                quote_match = re.search(r'^- \*\*名言:\*\*\s*(.*)', block_stripped, re.MULTILINE)
                tag_match = re.search(r'^- \*\*感情:\*\*\s*(.*)', block_stripped, re.MULTILINE)
                summary_match = re.search(r'^- \*\*箇条書きまとめ:\*\*\s*(.*)', block_stripped, re.MULTILINE)
                img_match = re.search(r'^- \*\*画像:\*\*\s*!\[.*?\]\((.*?)\)', block_stripped, re.MULTILINE)
                fav_match = re.search(r'^- \*\*お気に入り:\*\*\s*(.*)', block_stripped, re.MULTILINE)
                gallery_match = re.search(r'^- \*\*ギャラリー:\*\*\s*(.*)', block_stripped, re.MULTILINE)

                thoughts = ""
                lines = block_stripped.split('\n')
                thoughts_lines = []
                in_thoughts = False
                for line in lines:
                    if in_thoughts:
                        thoughts_lines.append(line)
                    elif not line.startswith('##') and not line.startswith('- **'):
                        if line.strip() != "":
                            in_thoughts = True
                            thoughts_lines.append(line)

                quote_raw = quote_match.group(1).strip() if quote_match else ""
                parsed_quote = quote_raw.replace('<br>', '\n') if quote_raw and quote_raw != "なし" else ""

                fav_raw = fav_match.group(1).strip() if fav_match else "false"
                is_favorite = fav_raw.lower() == "true"

                gallery_raw = gallery_match.group(1).strip() if gallery_match else ""
                gallery_list = [g.strip() for g in gallery_raw.split(',') if g.strip()] if gallery_raw else []

                summary_raw = summary_match.group(1).strip() if summary_match else ""
                parsed_summary = summary_raw.replace('<br>', '\n') if summary_raw and summary_raw != "なし" else ""
                reading_raw = reading_match.group(1).strip() if reading_match else ""

                record = {
                    "title": title_match.group(1).strip() if title_match else "タイトルなし",
                    "title_reading": reading_raw if reading_raw and reading_raw != "なし" else "",
                    "date": date_match.group(1).strip() if date_match else "",
                    "quote": parsed_quote,
                    "tag": tag_match.group(1).strip() if tag_match and tag_match.group(1).strip() != "なし" else "",
                    "image": img_match.group(1).strip() if img_match else "",
                    "thoughts": "\n".join(thoughts_lines).strip(),
                    "summary": parsed_summary,
                    "favorite": is_favorite,
                    "gallery": gallery_list
                }
                records.append((block, record))  # raw block も保持
    return records


def rebuild_md(parsed_records):
    """解析済みレコードリストから opinion.md を再構築する"""
    output = ""
    for _raw, rec in parsed_records:
        quote = (rec["quote"] or "なし").replace('\n', '<br>')
        tag = rec["tag"] or "なし"
        reading = rec.get("title_reading") or "なし"
        entry = f"## {rec['title']}\n"
        entry += f"- **よみがな:** {reading}\n"
        entry += f"- **日時:** {rec['date']}\n"
        entry += f"- **名言:** {quote}\n"
        entry += f"- **感情:** {tag}\n"
        if rec.get("summary"):
            summary_md = (rec.get("summary") or "").replace('\n', '<br>')
            entry += f"- **箇条書きまとめ:** {summary_md}\n"
        if rec.get("favorite"):
            entry += "- **お気に入り:** true\n"
        if rec["image"]:
            img_basename = os.path.basename(rec["image"])
            entry += f"- **画像:** ![{img_basename}]({rec['image']})\n"
        if rec.get("gallery"):
            entry += f"- **ギャラリー:** {', '.join(rec['gallery'])}\n"
        entry += f"\n{rec['thoughts']}\n\n---\n\n"
        output += entry
    with open(MD_FILE, "w", encoding="utf-8") as f:
        f.write(output)


def _normalize_bullet_lines(text: str) -> str:
    """モデル出力を「箇条書き行（- xxx）」に正規化する"""
    if not text:
        return ""
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    bullets = []
    for ln in lines:
        # - / ・ / * / 1. / 1) などを許容
        m = re.match(r'^[-・*]\s*(.+)$', ln)
        if m:
            item = m.group(1).strip()
            if item:
                bullets.append(item)
            continue
        m = re.match(r'^\d+[.)]\s*(.+)$', ln)
        if m:
            item = m.group(1).strip()
            if item:
                bullets.append(item)
            continue
        bullets.append(ln)

    bullets = [b for b in bullets if b]
    bullets = bullets[:8]  # 多すぎる場合は抑える
    return "\n".join([f"- {b}" for b in bullets])


def _katakana_to_hiragana(text: str) -> str:
    result = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            result.append(chr(code - 0x60))
        else:
            result.append(ch)
    return "".join(result)


def _normalize_title_reading(text: str) -> str:
    reading = _katakana_to_hiragana((text or "").strip().lower())
    reading = re.sub(r'[^ぁ-ゖー0-9a-z]+', '', reading)
    return reading


def _extract_openai_output_text(data: dict) -> str:
    texts = []

    for item in data.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                texts.append(content["text"])
            elif content.get("type") == "refusal" and content.get("refusal"):
                texts.append(content["refusal"])

    if texts:
        return "\n".join(texts).strip()

    output_text = data.get("output_text")
    if isinstance(output_text, str):
        return output_text.strip()

    return ""


def _build_openai_error_message(code: int, reason: str, body: str) -> str:
    detail = body[:500]
    try:
        payload = json.loads(body)
        detail = payload.get("error", {}).get("message") or detail
    except Exception:
        pass
    return f"OpenAI API HTTPError {code}: {reason}. {detail}"


def _request_openai_text(instructions: str, prompt: str, *, temperature: float, max_output_tokens: int) -> str:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY が未設定です。環境変数を設定してください。")

    payload = {
        "model": OPENAI_MODEL,
        "instructions": instructions,
        "input": prompt,
        "temperature": temperature,
        "max_output_tokens": max_output_tokens
    }
    url = f"{OPENAI_API_BASE}/responses"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
            data = json.loads(raw)
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        raise RuntimeError(_build_openai_error_message(e.code, e.reason, body))
    except urllib.error.URLError as e:
        raise RuntimeError(f"OpenAI API に接続できませんでした: {e.reason}")

    if data.get("error"):
        message = data.get("error", {}).get("message") or "OpenAI API 呼び出しに失敗しました。"
        raise RuntimeError(message)

    text = _extract_openai_output_text(data)
    if not text:
        raise RuntimeError("OpenAI API からテキストを取得できませんでした。")
    return text


def generate_title_reading(title: str) -> str:
    title = (title or "").strip()
    if not title:
        return ""

    # 既にかな主体なら、そのまま正規化して返す
    if re.fullmatch(r'[ぁ-ゖァ-ヶーa-zA-Z0-9 !！?？・\-\s]+', title):
        return _normalize_title_reading(title)

    instructions = (
        "あなたは日本語の書誌データ編集者です。"
        "漫画タイトルの読みを、ひらがなのみで返してください。"
        "余計な説明や記号は付けず、読みだけを出力してください。"
    )
    prompt = f"次の漫画タイトルの読みをひらがなで返してください。\nタイトル: {title}"
    text = _request_openai_text(instructions, prompt, temperature=0.0, max_output_tokens=64)
    return _normalize_title_reading(text)


def ensure_title_readings(parsed_records) -> bool:
    changed = False
    for _raw, rec in parsed_records:
        if rec.get("title_reading"):
            continue
        try:
            reading = generate_title_reading(rec.get("title", ""))
        except Exception:
            reading = ""
        if reading:
            rec["title_reading"] = reading
            changed = True
    return changed


def generate_bullet_summary(title: str, quote: str, thoughts: str, tag: str) -> str:
    if not thoughts:
        return ""

    thoughts = thoughts.strip()
    if len(thoughts) > 6000:
        thoughts = thoughts[:6000] + "\n（途中まで）"

    title = (title or "").strip()
    quote = (quote or "").strip()
    tag = (tag or "").strip()

    instructions = (
        "あなたは読書感想文の編集者です。"
        "読んだ漫画の印象を、短く自然な日本語の箇条書きで整理してください。"
        "出力は箇条書きの行だけにしてください。"
    )
    prompt = (
        "次の情報から、5〜8個の箇条書きに要約してください。\n"
        "各行は必ず「- 」から始め、1行につき1要点にしてください。\n"
        "前置き・説明・見出し・番号付けは不要です。\n"
        "\n"
        f"漫画タイトル: {title or '(不明)'}\n"
        f"名言/お気に入りセリフ: {quote or '(なし)'}\n"
        f"感情タグ: {tag or '(なし)'}\n"
        "\n"
        f"感想/考察:\n{thoughts}\n"
    )
    text = _request_openai_text(instructions, prompt, temperature=0.3, max_output_tokens=256)
    return _normalize_bullet_lines(text)


def list_openai_models():
    """OpenAI API のモデル一覧（raw）を返す"""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY が未設定です。環境変数を設定してください。")
    url = f"{OPENAI_API_BASE}/models"
    req = urllib.request.Request(
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}"
        }
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", errors="ignore")
        return json.loads(raw)


def save_image_from_b64(image_b64):
    """Base64 画像データをファイルに保存し、相対パスを返す"""
    if image_b64 and image_b64.startswith("data:image"):
        header, encoded = image_b64.split(",", 1)
        ext = "png"
        if "jpeg" in header or "jpg" in header:
            ext = "jpg"
        ts = int(datetime.now().timestamp())
        img_filename = f"image_{ts}.{ext}"
        img_path = os.path.join(IMG_DIR, img_filename)
        with open(img_path, "wb") as f:
            f.write(base64.b64decode(encoded))
        return f"{IMG_DIR}/{img_filename}"
    return ""


def _normalize_calendar_entries(entries):
    normalized = []
    if not isinstance(entries, list):
        return normalized

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        date = str(entry.get("date", "")).strip()
        title = str(entry.get("title", "")).strip()
        entry_id = str(entry.get("id", "")).strip()
        if not date or not title:
            continue
        if not entry_id:
            entry_id = f"{int(datetime.now().timestamp() * 1000)}-{len(normalized)}"

        normalized.append({
            "id": entry_id,
            "date": date,
            "title": title,
            "volumeStart": str(entry.get("volumeStart", "")).strip(),
            "volumeEnd": str(entry.get("volumeEnd", "")).strip()
        })

    return normalized


def load_calendar_entries():
    if not os.path.exists(CALENDAR_FILE):
        return []

    try:
        with open(CALENDAR_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []

    return _normalize_calendar_entries(data)


def save_calendar_entries(entries):
    normalized = _normalize_calendar_entries(entries)
    with open(CALENDAR_FILE, "w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)
    return normalized


class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/records':
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            parsed = parse_records()
            if OPENAI_API_KEY and ensure_title_readings(parsed):
                rebuild_md(parsed)
            records = [rec for (_raw, rec) in parsed]
            records.reverse()
            self.wfile.write(json.dumps(records).encode('utf-8'))

        elif self.path == '/api/calendar':
            entries = load_calendar_entries()
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(json.dumps(entries).encode('utf-8'))

        elif self.path in ('/api/openai-models', '/api/gemini-models'):
            # 利用可能モデル一覧（デバッグ用）
            try:
                data = list_openai_models()
                self.send_response(200)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(json.dumps(data).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        elif self.path.startswith('/api/image-search'):
            # DuckDuckGo 画像検索プロキシ
            query_string = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query_string)
            query = params.get('q', [''])[0]

            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            if not query:
                self.wfile.write(json.dumps([]).encode('utf-8'))
                return

            try:
                images = self._search_images_ddg(query)
                self.wfile.write(json.dumps(images).encode('utf-8'))
            except Exception as e:
                print(f"Image search error: {e}")
                self.wfile.write(json.dumps([]).encode('utf-8'))

        elif self.path.startswith('/api/image-proxy'):
            # 外部画像のプロキシ（CORS回避）
            query_string = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query_string)
            url = params.get('url', [''])[0]

            if not url:
                self.send_response(400)
                self.end_headers()
                return

            try:
                req = urllib.request.Request(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                })
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                    content_type = resp.headers.get('Content-Type', 'image/jpeg')

                self.send_response(200)
                self.send_header("Content-type", content_type)
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                print(f"Image proxy error: {e}")
                self.send_response(502)
                self.end_headers()

        else:
            return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def _search_images_ddg(self, query):
        """DuckDuckGo から画像検索結果を取得する"""
        # Step 1: トークンを取得
        token_url = f"https://duckduckgo.com/?q={urllib.parse.quote(query)}&iax=images&ia=images"
        req = urllib.request.Request(token_url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

        # vqd トークンを抽出
        vqd_match = re.search(r'vqd=["\']([^"\']+)', html)
        if not vqd_match:
            vqd_match = re.search(r'vqd=([^&"\']+)', html)
        if not vqd_match:
            return []

        vqd = vqd_match.group(1)

        # Step 2: 画像検索APIを叩く
        search_url = (
            f"https://duckduckgo.com/i.js?l=jp-jp&o=json&q={urllib.parse.quote(query)}"
            f"&vqd={vqd}&f=,,,,,&p=1"
        )
        req2 = urllib.request.Request(search_url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': 'https://duckduckgo.com/'
        })
        with urllib.request.urlopen(req2, timeout=10) as resp2:
            data = json.loads(resp2.read().decode('utf-8'))

        results = []
        for item in data.get('results', [])[:20]:
            results.append({
                'thumbnail': item.get('thumbnail', ''),
                'image': item.get('image', ''),
                'title': item.get('title', ''),
                'source': item.get('source', '')
            })
        return results

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)

        if self.path == '/api/calendar':
            try:
                data = json.loads(post_data.decode('utf-8'))
                entries = data.get('entries', [])
                saved_entries = save_calendar_entries(entries)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "entries": saved_entries}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        elif self.path == '/api/save':
            try:
                data = json.loads(post_data.decode('utf-8'))

                title = data.get('title', 'タイトルなし')
                quote = data.get('quote', '').replace('\n', '<br>') or 'なし'
                tag = data.get('tag', '') or 'なし'
                summary = data.get('summary', '').strip()
                thoughts = data.get('thoughts', '')
                image_b64 = data.get('image', '')
                title_reading = generate_title_reading(title) if OPENAI_API_KEY else ""

                date_str = datetime.now().strftime('%Y/%m/%d %H:%M:%S')

                img_markdown = ""
                img_path = save_image_from_b64(image_b64)
                if img_path:
                    img_basename = os.path.basename(img_path)
                    img_markdown = f"- **画像:** ![{img_basename}]({img_path})\n"

                md_entry = f"## {title}\n"
                md_entry += f"- **よみがな:** {title_reading or 'なし'}\n"
                md_entry += f"- **日時:** {date_str}\n"
                md_entry += f"- **名言:** {quote}\n"
                md_entry += f"- **感情:** {tag}\n"
                if summary:
                    md_entry += f"- **箇条書きまとめ:** {summary.replace(chr(10), '<br>')}\n"
                if img_markdown:
                    md_entry += img_markdown
                md_entry += f"\n{thoughts}\n\n---\n\n"

                with open(MD_FILE, "a", encoding="utf-8") as f:
                    f.write(md_entry)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        elif self.path == '/api/bullet-summary':
            try:
                data = json.loads(post_data.decode('utf-8'))
                title = data.get('title', '')
                quote = data.get('quote', '')
                thoughts = data.get('thoughts', '')
                tag = data.get('tag', '')

                summary = generate_bullet_summary(title, quote, thoughts, tag)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "summary": summary}).encode('utf-8'))
            except Exception as e:
                err_str = str(e)
                status = 500
                if 'HTTPError 429' in err_str or ' 429' in err_str:
                    status = 429
                self.send_response(status)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": err_str}).encode('utf-8'))

        elif self.path == '/api/update':
            # 既存レコードの更新
            try:
                data = json.loads(post_data.decode('utf-8'))
                orig_title = data.get('orig_title', '')
                orig_date = data.get('orig_date', '')

                new_title = data.get('title', orig_title)
                new_quote = data.get('quote', '')
                new_tag = data.get('tag', '')
                new_thoughts = data.get('thoughts', '')
                new_summary = data.get('summary', '')
                new_image_b64 = data.get('image', '')
                keep_image = data.get('keep_image', '')
                remove_image = data.get('remove_image', False)

                parsed = parse_records()
                found = False
                for i, (_raw, rec) in enumerate(parsed):
                    if rec['title'] == orig_title and rec['date'] == orig_date:
                        rec['title'] = new_title
                        rec['title_reading'] = generate_title_reading(new_title) if OPENAI_API_KEY else rec.get('title_reading', '')
                        rec['quote'] = new_quote
                        rec['tag'] = new_tag
                        rec['thoughts'] = new_thoughts
                        rec['summary'] = new_summary

                        if remove_image:
                            rec['image'] = ''
                        elif new_image_b64 and new_image_b64.startswith("data:image"):
                            img_path = save_image_from_b64(new_image_b64)
                            rec['image'] = img_path
                        elif keep_image:
                            rec['image'] = keep_image

                        found = True
                        break

                if found:
                    rebuild_md(parsed)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                else:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "レコードが見つかりません"}).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        elif self.path == '/api/delete':
            try:
                data = json.loads(post_data.decode('utf-8'))
                target_title = data.get('title', '')
                target_date = data.get('date', '')

                parsed = parse_records()
                delete_index = -1
                for i, (_raw, rec) in enumerate(parsed):
                    if rec['title'] == target_title and rec['date'] == target_date:
                        delete_index = i
                        break

                if delete_index >= 0:
                    parsed.pop(delete_index)
                    rebuild_md(parsed)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                else:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "レコードが見つかりません"}).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        elif self.path == '/api/favorite':
            # お気に入りトグル
            try:
                data = json.loads(post_data.decode('utf-8'))
                target_title = data.get('title', '')
                target_date = data.get('date', '')

                parsed = parse_records()
                found = False
                new_fav = False
                for i, (_raw, rec) in enumerate(parsed):
                    if rec['title'] == target_title and rec['date'] == target_date:
                        rec['favorite'] = not rec.get('favorite', False)
                        new_fav = rec['favorite']
                        found = True
                        break

                if found:
                    rebuild_md(parsed)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success", "favorite": new_fav}).encode('utf-8'))
                else:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "レコードが見つかりません"}).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        elif self.path == '/api/gallery-add':
            # ギャラリーに画像を追加（最大3枚）
            try:
                data = json.loads(post_data.decode('utf-8'))
                target_title = data.get('title', '')
                target_date = data.get('date', '')
                image_b64 = data.get('image', '')

                parsed = parse_records()
                found = False
                for i, (_raw, rec) in enumerate(parsed):
                    if rec['title'] == target_title and rec['date'] == target_date:
                        gallery = rec.get('gallery', [])
                        if len(gallery) >= 3:
                            self.send_response(400)
                            self.send_header('Content-type', 'application/json')
                            self.end_headers()
                            self.wfile.write(json.dumps({"error": "ギャラリーは最大3枚です"}).encode('utf-8'))
                            return

                        img_path = save_image_from_b64(image_b64)
                        if img_path:
                            gallery.append(img_path)
                            rec['gallery'] = gallery
                            found = True
                        break

                if found:
                    rebuild_md(parsed)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    rec_gallery = [r for (_, r) in parsed if r['title'] == target_title and r['date'] == target_date]
                    g = rec_gallery[0]['gallery'] if rec_gallery else []
                    self.wfile.write(json.dumps({"status": "success", "gallery": g}).encode('utf-8'))
                else:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "レコードが見つかりません"}).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        elif self.path == '/api/gallery-remove':
            # ギャラリーから画像を削除
            try:
                data = json.loads(post_data.decode('utf-8'))
                target_title = data.get('title', '')
                target_date = data.get('date', '')
                img_to_remove = data.get('image_path', '')

                parsed = parse_records()
                found = False
                for i, (_raw, rec) in enumerate(parsed):
                    if rec['title'] == target_title and rec['date'] == target_date:
                        gallery = rec.get('gallery', [])
                        if img_to_remove in gallery:
                            gallery.remove(img_to_remove)
                            rec['gallery'] = gallery
                            found = True
                        break

                if found:
                    rebuild_md(parsed)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    rec_gallery = [r for (_, r) in parsed if r['title'] == target_title and r['date'] == target_date]
                    g = rec_gallery[0]['gallery'] if rec_gallery else []
                    self.wfile.write(json.dumps({"status": "success", "gallery": g}).encode('utf-8'))
                else:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "画像が見つかりません"}).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))


def open_browser():
    import time
    time.sleep(1.0)
    webbrowser.open(f'http://localhost:{PORT}/')


def get_lan_url(port: int) -> str:
    """同一Wi-Fi からアクセスしやすい LAN URL を返す"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            host = sock.getsockname()[0]
    except Exception:
        try:
            host = socket.gethostbyname(socket.gethostname())
        except Exception:
            host = ""

    if not host or host.startswith("127."):
        return ""
    return f"http://{host}:{port}/"


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    with ReusableTCPServer(("", PORT), MyHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        lan_url = get_lan_url(PORT)
        if lan_url:
            print(f"同じWi-Fiのスマホからは {lan_url} にアクセスできます")
        else:
            print("LAN 用URLを自動判定できませんでした。必要ならこのPCのIPアドレス:8000 をスマホで開いてください")
        print("停止するには Ctrl+C を押してください")
        threading.Thread(target=open_browser, daemon=True).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.server_close()
