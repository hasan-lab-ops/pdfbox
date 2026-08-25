# PDF → Word Tool — Server Cleanup Checklist (pdfbox.online)

Complete, terminal-only cleanup of the **old** PDF→Word converter on the
production server. Run top-to-bottom. Every destructive command is preceded
by a read-only inspection command so you can verify what will be removed.

> ⚠️ Replace `/opt/pdfbox` (and any other paths that differ on your box)
> before running. Always review the output of the `find`/`grep`/`pgrep`
> commands before running the matching `rm`/`kill`.

---

## 1. Stop & disable old services

```bash
# 1.1 Find every process related to the old converter
pgrep -af "uvicorn|gunicorn|pdf_to_word|pdf2docx|convert" || echo "no converter processes"

# 1.2 Stop them (uvicorn/gunicorn workers)
sudo pkill -f "uvicorn.*main:app"        # or: pkill -9 -f <exact pattern from 1.1>
sudo pkill -f "gunicorn.*converter"      # only if the old stack used gunicorn

# 1.3 Find all systemd units that might be related
systemctl list-units --all --no-pager | grep -iE "pdf|uvicorn|gunicorn|converter"
ls /etc/systemd/system/ | grep -iE "pdf|uvicorn|gunicorn|converter"

# 1.4 Disable + stop + remove each unit found (example names)
sudo systemctl disable --now pdfbox pdf2docx pdf-converter 2>/dev/null
sudo rm -f /etc/systemd/system/pdfbox.service \
           /etc/systemd/system/pdf2docx.service \
           /etc/systemd/system/pdf-converter.service
sudo systemctl daemon-reload

# 1.5 Find and remove related cron jobs
crontab -l 2>/dev/null | grep -iE "pdf|convert"
sudo crontab -e                      # delete matching lines
grep -rn "pdf\|convert" /etc/cron.d/ /etc/crontab /etc/cron.daily/ 2>/dev/null
# delete matching files/lines found above
```

## 2. File & directory cleanup

```bash
# 2.1 Locate old application code, virtualenvs and temp folders
sudo find /opt /srv /var/www -maxdepth 3 \
     \( -name "venv" -o -name ".venv" -o -name "env" -o -name "*.py" \
        -o -name "uploads" -o -name "downloads" -o -name "temp" \) \
     -print 2>/dev/null | grep -viE "node_modules"

# 2.2 Remove the old app directory + its virtualenv (ADJUST THE PATH!)
sudo rm -rf /opt/pdfbox /opt/pdf2docx /opt/pdf-converter   # legacy app locations

# 2.3 Remove stale temp upload/download folders left by the old converter
sudo rm -rf /tmp/pdfbox_* /tmp/pdf2docx_* /tmp/pdf_to_word_* \
            /tmp/claude-* /var/tmp/pdfbox_*

# 2.4 Remove old compiled bytecode caches
sudo find /opt /srv /var/www -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null
```

## 3. Nginx & port reset

```bash
# 3.1 Find all server blocks / locations touching the old converter
sudo grep -rln "8000\|pdfbox\|pdf2docx\|pdf-converter\|/convert" /etc/nginx/

# 3.2 Remove the old converter's vhost (disable, then delete)
sudo rm -f /etc/nginx/sites-enabled/api-pdfbox.online \
           /etc/nginx/sites-available/api-pdfbox.online
# also delete any leftover `location /convert` blocks you find inside the
# main pdfbox.online vhost (sudo nano the file, delete, save)

# 3.3 Verify config and reload
sudo nginx -t
sudo systemctl reload nginx

# 3.4 Confirm the old port is free
sudo ss -ltnp | grep 8000 || echo "port 8000 is free"
```

## 4. Dependency reset (clean slate for Python packages)

```bash
# 4.1 Flush the pip download cache
pip cache purge 2>/dev/null || echo "pip cache empty/unavailable"

# 4.2 Uninstall any global stragglers from the old stack
sudo pip3 uninstall -y pdf2docx pymupdf fitz python-docx fastapi uvicorn \
     python-multipart gunicorn 2>/dev/null || true

# 4.3 (Optional, most thorough) remove old virtualenvs' site-packages entirely
sudo find / -maxdepth 4 -type d -name "site-packages" -path "*/venv/*" -prune 2>/dev/null
# → already removed together with the venv in step 2.2; nothing to do here
```

## 5. Verify the slate is clean

```bash
pgrep -af "uvicorn|gunicorn|converter" || echo "✓ no converter processes"
sudo ss -ltnp | grep 8000 || echo "✓ port 8000 free"
systemctl list-units --all --no-pager | grep -iE "pdf|converter" || echo "✓ no units"
sudo nginx -t && echo "✓ nginx config valid"
ls /tmp | grep -i pdfbox || echo "✓ no leftover temp workspaces"
```

All five "✓" lines mean the old setup is gone — proceed with the rebuild
(`requirements.txt` → venv → `deploy/pdfbox.service` → `deploy/nginx-*`).
