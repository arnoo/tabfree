#!/usr/bin/env python3
import cairosvg
import json
import logging
import os
import re
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

from functools import lru_cache
from PIL import Image

logging.basicConfig(
    filename='/tmp/xseticon.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)


def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        sys.exit(0)
    message_length = struct.unpack('=I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)

def send_message(message_content):
    encoded_content = json.dumps(message_content).encode("utf-8")
    encoded_length = struct.pack('=I', len(encoded_content))
    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()

def convert(data, source_format):
    if source_format == 'png': 
        return data
    elif source_format == 'ico': 
        with Image.open(data) as img:
            with io.BytesIO() as output_buffer:
                img.save(output_buffer, format="PNG")
                return output_buffer.getvalue()
    elif source_format == 'svg': 
        return cairosvg.svg2png(bytestring=data)
    else:
        raise ValueError("Invalid source format")

def _is_toplevel(window_id):
    try:
        out = subprocess.check_output(
            ["xprop", "-id", window_id, "_NET_WM_WINDOW_TYPE"],
            stderr=subprocess.DEVNULL,
        ).decode()
        return "_NET_WM_WINDOW_TYPE_NORMAL" in out
    except subprocess.CalledProcessError:
        return False


def _window_title(window_id):
    try:
        out = subprocess.check_output(
            ["xprop", "-id", window_id, "_NET_WM_NAME"],
            stderr=subprocess.DEVNULL,
        ).decode()
        m = re.search(r'=\s"(.*)"', out)
        return m.group(1) if m else out.strip()
    except subprocess.CalledProcessError:
        return "<unknown>"


def send_window_xid(window_uuid):
    pattern = f"\\[TABFREE_UUID:{window_uuid}\\]"
    cmd_search = ["xdotool", "search", "--onlyvisible", "--name", pattern]
    attempts = 10
    delay = 0.05
    last_toplevels = []
    for _ in range(attempts):
        try:
            raw = subprocess.check_output(cmd_search, stderr=subprocess.DEVNULL).decode().strip()
        except subprocess.CalledProcessError:
            raw = ""
        candidates = [w for w in raw.split('\n') if w]
        toplevels = [w for w in candidates if _is_toplevel(w)]
        last_toplevels = toplevels
        if len(toplevels) == 1:
            wid = toplevels[0]
            logging.debug(f"Resolved window id {wid} ({_window_title(wid)})")
            send_message({"windowId": wid})
            return
        if len(toplevels) > 1:
            logging.debug(f"Ambiguous: {toplevels} ({[_window_title(w) for w in toplevels]})")
        time.sleep(delay)
    if not last_toplevels:
        send_message({"status": "no_window_found"})
        logging.error(f"No window found for uuid {window_uuid}")
        return
    send_message({"status": "ambiguous_window", "count": len(last_toplevels)})
    logging.error(
        f"Ambiguous window for uuid {window_uuid}: {last_toplevels} "
        f"({[_window_title(w) for w in last_toplevels]})"
    )

@lru_cache(maxsize=200)
def get_icon(icon_url):
    if icon_url.startswith('data:'):
      match = re.search(r'data:image/([\w\-]+)(\+xml)?(;base64)?,(.*)', icon_url)
      if not match:
          raise ValueError("Invalid SVG data URL format")
      ctype = match.group(1)
      if ctype=='x-icon':
          extension='ico'
      else:
          extension=ctype
    else:
      filename, extension = os.path.splitext(icon_url)
    if icon_url.startswith('data:'):
        from urllib.request import urlopen
        req = icon_url
    else:
        req = urllib.request.Request(
            icon_url, 
            data=None, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
    with urllib.request.urlopen(req) as response:
        return convert(response.read(), extension)


def set_window_icon(window_id, icon_url):
    logging.debug(f"GOT ICON URL")
    with tempfile.NamedTemporaryFile(delete=False, suffix='png') as icon_file:
        icon_file.write(get_icon(icon_url))
    try:
        subprocess.run(["xseticon", "-id", window_id, icon_file.name])
        send_message({"status": "success"})
    except subprocess.CalledProcessError as e:
        send_message({"status": "xseticon_error"})
        logging.error(f"xseticon error: {e}")
    if os.path.exists(icon_file.name):
        os.unlink(icon_file.name)


def main_loop():
    while True:
        try:
            message = get_message()
            logging.debug(f"Received message: {message}")
            window_uuid=message.get('windowUUID')
            if window_uuid:
                send_window_xid(window_uuid)
                continue
            icon_url = message.get('iconUrl')
            window_id = message.get('windowId')
            if icon_url and window_id:
                set_window_icon(window_id, icon_url)
                continue
            logging.error(f"Invalid Message: {message}")
        except Exception as e:
            send_message({"status": "error", "message": str(e)})
            logging.error(f"Error: {e}")

if __name__ == "__main__":
    main_loop()
