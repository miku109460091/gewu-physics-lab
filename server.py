#!/usr/bin/env python3
"""格物物理 · 本地静态站点服务器。

用法：python server.py
然后浏览器访问终端打印的地址。
"""

from __future__ import annotations

import argparse
import http.server
import os
import socket
import threading
import webbrowser
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_PORT = 4173


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        # 便于修改内容后立即刷新看到效果
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()}  {fmt % args}")


def find_port(host: str, start: int) -> int:
    # Windows 允许把 0.0.0.0:port 和 127.0.0.1:port 同时绑定，
    # 因此局域网模式要先检查 127.0.0.1 是否已被占用，避免与已有服务冲突。
    probe_host = "127.0.0.1" if host == "0.0.0.0" else host
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((probe_host, port))
                return port
            except OSError:
                continue
    raise RuntimeError("没有找到可用的本地端口")


def get_lan_ip() -> str:
    """尽量找到当前电脑在局域网中的 IPv4 地址。"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        sock.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="格物物理本地静态站点服务器")
    parser.add_argument("--lan", action="store_true", help="允许同一局域网内的其他电脑访问")
    parser.add_argument("--no-browser", action="store_true", help="启动后不自动打开浏览器")
    args = parser.parse_args()

    host = "0.0.0.0" if args.lan else "127.0.0.1"
    port = find_port(host, DEFAULT_PORT)
    local_url = f"http://127.0.0.1:{port}/"

    print("")
    print("  格物 · 高中物理实验室")
    print("  ─────────────────────")
    print(f"  本机地址：{local_url}")
    if args.lan:
        lan_ip = get_lan_ip()
        print(f"  局域网地址：http://{lan_ip}:{port}/")
        print("  同一 Wi-Fi 下的其他电脑可以访问上面的局域网地址。")
        print("  如果打不开，请允许 Windows 防火墙中的 Python 访问。")
    else:
        print("  当前仅本机可访问；如需共享给其他电脑，请运行：python server.py --lan")
    print("  按 Ctrl+C 停止服务")
    print("")
    if not args.no_browser:
        threading.Timer(0.9, lambda: webbrowser.open(local_url)).start()
    os.chdir(BASE_DIR)
    try:
        with http.server.ThreadingHTTPServer((host, port), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  服务已停止。")


if __name__ == "__main__":
    main()
