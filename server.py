import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from datetime import datetime
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

try:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token
except ImportError:
    google_requests = None
    google_id_token = None


ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "4219"))
DEV_LOGIN_ID = os.environ.get("PERSONALIZATION_ADMIN_ID", "admin")
DEV_LOGIN_PASSWORD = os.environ.get("PERSONALIZATION_ADMIN_PASSWORD", "01083376120")
GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
GOOGLE_OAUTH_CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
GOOGLE_OAUTH_REDIRECT_URI = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "").strip()
GOOGLE_OAUTH_ALLOWED_EMAILS = {
    value.strip().lower()
    for value in os.environ.get("GOOGLE_OAUTH_ALLOWED_EMAILS", "").split(",")
    if value.strip()
}
SESSION_COOKIE_NAME = "dowon_lab_session"
GOOGLE_STATE_COOKIE_NAME = "dowon_lab_google_state"
SESSION_TTL_SECONDS = int(os.environ.get("APP_SESSION_TTL_SECONDS", "43200"))
OAUTH_STATE_TTL_SECONDS = 600
SESSION_SIGNING_SECRET = (
    os.environ.get("APP_SESSION_SECRET", "").strip()
    or GOOGLE_OAUTH_CLIENT_SECRET
    or DEV_LOGIN_PASSWORD
    or "llm-tool-hub-dev-secret"
)
ALLOWED_SECTION_IDS = {
    "home",
    "memory",
    "personalization",
    "registry",
    "skills",
    "prompt-tailor",
    "prompt-forge",
}
PROMPT_ACCESS_STATE_PATH = ROOT / "data" / "prompt_access_state.json"
PROMPT_FREE_LIMIT = int(os.environ.get("PROMPT_FREE_LIMIT", "3"))
PROMPT_CHECKOUT_URL = os.environ.get("PROMPT_CHECKOUT_URL", "").strip()
PROMPT_DEFAULT_PROVIDER = os.environ.get("PROMPT_DEFAULT_PROVIDER", "openai").strip().lower()
PROMPT_DEFAULT_MODEL = os.environ.get("PROMPT_DEFAULT_MODEL", "gpt-5-mini").strip()
PROMPT_DEFAULT_API_KEY = os.environ.get("PROMPT_DEFAULT_API_KEY", "").strip()
PROMPT_TAILOR_PROVIDER = os.environ.get("PROMPT_TAILOR_PROVIDER", PROMPT_DEFAULT_PROVIDER).strip().lower()
PROMPT_TAILOR_MODEL = os.environ.get("PROMPT_TAILOR_MODEL", PROMPT_DEFAULT_MODEL).strip()
PROMPT_TAILOR_API_KEY = os.environ.get("PROMPT_TAILOR_API_KEY", PROMPT_DEFAULT_API_KEY).strip()
PROMPT_TRANSLATE_PROVIDER = os.environ.get("PROMPT_TRANSLATE_PROVIDER", PROMPT_DEFAULT_PROVIDER).strip().lower()
PROMPT_TRANSLATE_MODEL = os.environ.get("PROMPT_TRANSLATE_MODEL", PROMPT_DEFAULT_MODEL).strip()
PROMPT_TRANSLATE_API_KEY = os.environ.get("PROMPT_TRANSLATE_API_KEY", PROMPT_DEFAULT_API_KEY).strip()
PROMPT_BILLING_UNIT_TOKENS = int(os.environ.get("PROMPT_BILLING_UNIT_TOKENS", "1000"))
PROMPT_PRICE_PER_1K_TOKENS_USD = float(os.environ.get("PROMPT_PRICE_PER_1K_TOKENS_USD", "3"))
PROMPT_PRO_MONTHLY_USD = float(os.environ.get("PROMPT_PRO_MONTHLY_USD", "4.99"))
PROMPT_PRO_YEARLY_USD = float(os.environ.get("PROMPT_PRO_YEARLY_USD", "39"))
PROMPT_MONTHLY_LIMIT = int(os.environ.get("PROMPT_MONTHLY_LIMIT", "300"))
PROMPT_CHAR_LIMIT = int(os.environ.get("PROMPT_CHAR_LIMIT", "2000"))
PROMPT_DEV_MOCK = os.environ.get("PROMPT_DEV_MOCK", "").strip().lower() in {"1", "true", "yes", "on"}
PROMPT_ACCESS_LOCK = threading.Lock()
SESSION_STORE_PATH = ROOT / "data" / "auth_sessions.json"
SESSION_STORE_LOCK = threading.Lock()
AUTH_COMPLETION_STORE_PATH = ROOT / "data" / "auth_completions.json"
AUTH_COMPLETION_LOCK = threading.Lock()
AUTH_COMPLETION_TTL_SECONDS = 300
VISIT_COUNTER_PATH = ROOT / "data" / "visit_counter.json"
VISIT_COUNTER_LOCK = threading.Lock()


def _today_key():
    return datetime.now().strftime("%Y-%m-%d")


def _load_visit_counter_state():
    VISIT_COUNTER_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not VISIT_COUNTER_PATH.exists():
        VISIT_COUNTER_PATH.write_text(json.dumps({"total": 0, "by_day": {}}, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        data = json.loads(VISIT_COUNTER_PATH.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    total = data.get("total", 0)
    by_day = data.get("by_day", {})
    if not isinstance(total, int):
        total = 0
    if not isinstance(by_day, dict):
        by_day = {}
    return {"total": max(0, total), "by_day": by_day}


def _save_visit_counter_state(state):
    VISIT_COUNTER_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def get_visit_counter(*, increment=False):
    with VISIT_COUNTER_LOCK:
        state = _load_visit_counter_state()
        today = _today_key()
        if increment:
            state["total"] = int(state.get("total", 0)) + 1
            by_day = state.setdefault("by_day", {})
            by_day[today] = int(by_day.get(today, 0)) + 1
            _save_visit_counter_state(state)

        by_day = state.get("by_day", {})
        today_value = int(by_day.get(today, 0))
        total_value = int(state.get("total", 0))
        return {"today": today_value, "total": total_value, "date": today}


class ProviderAPIError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        if (
            self.path.startswith("/api/prompt-forge")
            or self.path.startswith("/api/dev-login")
            or self.path.startswith("/api/auth/")
        ):
            return
        super().log_message(format, *args)

    def end_headers(self):
        path = self.path.split("?", 1)[0]
        if path in {"/", "/index.html"} or path.endswith(".html"):
            self.send_header("Cache-Control", "no-store, max-age=0")
        elif path.endswith(".js") or path.endswith(".css"):
            self.send_header("Cache-Control", "no-cache, max-age=0, must-revalidate")
        super().end_headers()

    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _send_redirect(self, location, cookie_headers=None):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store, max-age=0")
        if cookie_headers:
            for header in cookie_headers:
                self.send_header("Set-Cookie", header)
        self.end_headers()

    def _send_redirect_page(self, location, cookie_headers=None):
        safe_location = str(location or "/").strip() or "/"
        escaped_location = safe_location.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
        body = f"""<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url={escaped_location}" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Redirecting...</title>
  </head>
  <body>
    <script>
      window.location.replace({json.dumps(safe_location)});
    </script>
    <p>이동 중입니다. 자동으로 넘어가지 않으면 <a href="{escaped_location}">여기를 클릭하세요</a>.</p>
  </body>
</html>""".encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        if cookie_headers:
            for header in cookie_headers:
                self.send_header("Set-Cookie", header)
        self.end_headers()
        self.wfile.write(body)

    def _read_json_payload(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            raise ProviderAPIError(400, "Invalid JSON payload")

    def _read_form_payload(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8", errors="ignore")
        parsed = urlparse.parse_qs(raw, keep_blank_values=True)
        return {key: values[0] if values else "" for key, values in parsed.items()}

    def _parse_cookies(self):
        jar = cookies.SimpleCookie()
        jar.load(self.headers.get("Cookie", ""))
        return {key: morsel.value for key, morsel in jar.items()}

    def _is_secure_request(self):
        forwarded_proto = self.headers.get("X-Forwarded-Proto", "")
        if forwarded_proto:
            return forwarded_proto.split(",", 1)[0].strip().lower() == "https"
        return False

    def _is_local_host(self):
        host = (self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or "").strip().lower()
        hostname = host.split(":", 1)[0]
        return hostname in {"127.0.0.1", "localhost"}

    def _should_mark_cookie_secure(self):
        return self._is_secure_request() or not self._is_local_host()

    def _build_cookie(self, name, value, *, path="/", max_age=None, samesite="Lax"):
        jar = cookies.SimpleCookie()
        jar[name] = value
        jar[name]["path"] = path
        jar[name]["httponly"] = True
        effective_samesite = str(samesite or "Lax").strip() or "Lax"
        should_secure = self._should_mark_cookie_secure()
        if effective_samesite.lower() == "none" and not should_secure:
            effective_samesite = "Lax"
        jar[name]["samesite"] = effective_samesite
        if should_secure:
            jar[name]["secure"] = True
        if max_age is not None:
            jar[name]["max-age"] = str(max_age)
        return jar.output(header="").strip()

    def _clear_cookie(self, name, *, path="/"):
        return self._build_cookie(name, "", path=path, max_age=0)

    def _google_oauth_configured(self):
        return bool(GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET)

    def _build_base_url(self):
        proto = "https" if self._is_secure_request() else "http"
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or f"{HOST}:{PORT}"
        return f"{proto}://{host}"

    def _build_google_redirect_uri(self):
        return GOOGLE_OAUTH_REDIRECT_URI or f"{self._build_base_url()}/api/auth/google/callback"

    def _sanitize_next_section(self, section_id):
        candidate = str(section_id or "").strip()
        return candidate if candidate in ALLOWED_SECTION_IDS else "personalization"

    def _build_post_auth_location(self, next_section, *, status="", error_code="", auth_token=""):
        params = {}
        if status:
            params["auth"] = status
        if error_code:
            params["auth_error"] = error_code
        if auth_token:
            params["auth_token"] = auth_token
        query = f"?{urlparse.urlencode(params)}" if params else ""
        return f"/{query}#{self._sanitize_next_section(next_section)}"

    def _cleanup_expired_auth_state(self):
        return

    def _cleanup_expired_sessions(self):
        state = self._load_session_store()
        now = int(time.time())
        expired_ids = [
            session_id
            for session_id, payload in state.items()
            if not isinstance(payload, dict) or int(payload.get("expires_at", 0) or 0) <= now
        ]
        if not expired_ids:
            return
        for session_id in expired_ids:
            state.pop(session_id, None)
        self._save_session_store(state)

    def _ensure_session_store(self):
        with SESSION_STORE_LOCK:
            SESSION_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
            if not SESSION_STORE_PATH.exists():
                SESSION_STORE_PATH.write_text("{}", encoding="utf-8")

    def _load_session_store(self):
        self._ensure_session_store()
        with SESSION_STORE_LOCK:
            try:
                data = json.loads(SESSION_STORE_PATH.read_text(encoding="utf-8") or "{}")
            except json.JSONDecodeError:
                data = {}
            return data if isinstance(data, dict) else {}

    def _save_session_store(self, state):
        with SESSION_STORE_LOCK:
            SESSION_STORE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def _ensure_auth_completion_store(self):
        with AUTH_COMPLETION_LOCK:
            AUTH_COMPLETION_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
            if not AUTH_COMPLETION_STORE_PATH.exists():
                AUTH_COMPLETION_STORE_PATH.write_text("{}", encoding="utf-8")

    def _load_auth_completion_store(self):
        self._ensure_auth_completion_store()
        with AUTH_COMPLETION_LOCK:
            try:
                data = json.loads(AUTH_COMPLETION_STORE_PATH.read_text(encoding="utf-8") or "{}")
            except json.JSONDecodeError:
                data = {}
            return data if isinstance(data, dict) else {}

    def _save_auth_completion_store(self, state):
        with AUTH_COMPLETION_LOCK:
            AUTH_COMPLETION_STORE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def _cleanup_expired_auth_completions(self):
        state = self._load_auth_completion_store()
        now = int(time.time())
        expired_tokens = [
            token
            for token, payload in state.items()
            if not isinstance(payload, dict) or int(payload.get("expires_at", 0) or 0) <= now
        ]
        if not expired_tokens:
            return
        for token in expired_tokens:
            state.pop(token, None)
        self._save_auth_completion_store(state)

    def _sign_value(self, value):
        return hmac.new(
            SESSION_SIGNING_SECRET.encode("utf-8"),
            value.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def _encode_signed_payload(self, payload):
        encoded_payload = base64.urlsafe_b64encode(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        ).decode("ascii").rstrip("=")
        signature = self._sign_value(encoded_payload)
        return f"{encoded_payload}.{signature}"

    def _decode_signed_payload(self, raw_value):
        value = str(raw_value or "").strip()
        if not value or "." not in value:
            return None
        encoded_payload, signature = value.rsplit(".", 1)
        expected_signature = self._sign_value(encoded_payload)
        if not hmac.compare_digest(signature, expected_signature):
            return None
        padded_payload = encoded_payload + "=" * (-len(encoded_payload) % 4)
        try:
            payload = json.loads(base64.urlsafe_b64decode(padded_payload.encode("ascii")).decode("utf-8"))
        except Exception:
            return None
        return payload if isinstance(payload, dict) else None

    def _create_session_token(self, *, user, email="", picture="", auth_method="google"):
        now = int(time.time())
        return self._encode_signed_payload({
            "user": user,
            "email": email,
            "picture": picture,
            "auth_method": auth_method,
            "created_at": now,
            "expires_at": now + SESSION_TTL_SECONDS,
        })

    def _create_auth_completion(self, *, user, email="", picture="", auth_method="google"):
        now = int(time.time())
        token = secrets.token_urlsafe(32)
        self._cleanup_expired_auth_completions()
        state = self._load_auth_completion_store()
        state[token] = {
            "user": user,
            "email": email,
            "picture": picture,
            "auth_method": auth_method,
            "created_at": now,
            "expires_at": now + AUTH_COMPLETION_TTL_SECONDS,
        }
        self._save_auth_completion_store(state)
        return token

    def _consume_auth_completion(self, token):
        self._cleanup_expired_auth_completions()
        token = str(token or "").strip()
        if not token:
            return None
        state = self._load_auth_completion_store()
        payload = state.pop(token, None)
        self._save_auth_completion_store(state)
        if not isinstance(payload, dict):
            return None
        if int(payload.get("expires_at", 0) or 0) <= int(time.time()):
            return None
        return payload

    def _create_google_oauth_state(self, *, next_section):
        now = int(time.time())
        return self._encode_signed_payload(
            {
                "nonce": secrets.token_urlsafe(24),
                "next_section": self._sanitize_next_section(next_section),
                "created_at": now,
                "expires_at": now + OAUTH_STATE_TTL_SECONDS,
            }
        )

    def _get_google_oauth_state(self, raw_state_token):
        payload = self._decode_signed_payload(raw_state_token)
        if not payload:
            return None
        if int(payload.get("expires_at", 0) or 0) <= int(time.time()):
            return None
        nonce = str(payload.get("nonce", "")).strip()
        if not nonce:
            return None
        return payload

    def _get_current_session(self):
        session_token = self._parse_cookies().get(SESSION_COOKIE_NAME, "")
        if not session_token:
            return None
        payload = self._decode_signed_payload(session_token)
        if not payload:
            return None
        if int(payload.get("expires_at", 0) or 0) <= int(time.time()):
            return None
        return payload

    def _require_session(self):
        session_payload = self._get_current_session()
        if not session_payload:
            raise ProviderAPIError(401, "로그인 세션이 필요합니다. 상단 Login에서 먼저 인증하세요.")
        return session_payload

    def _post_form(self, url, payload):
        request = urlrequest.Request(
            url,
            data=urlparse.urlencode(payload).encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urlrequest.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8") or "{}")
        except urlerror.HTTPError as error:
            body = error.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(body or "{}")
            except json.JSONDecodeError:
                parsed = {"error_description": body[:400] or "OAuth request failed"}
            raise ProviderAPIError(
                error.code,
                parsed.get("error_description") or parsed.get("error") or "OAuth request failed",
            )
        except urlerror.URLError:
            raise ProviderAPIError(502, "Google OAuth 서버에 연결하지 못했습니다.")

    def _get_json(self, url, headers=None):
        request = urlrequest.Request(url, headers=headers or {}, method="GET")
        try:
            with urlrequest.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8") or "{}")
        except urlerror.HTTPError as error:
            body = error.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(body or "{}")
            except json.JSONDecodeError:
                parsed = {"message": body[:400] or "Request failed"}
            raise ProviderAPIError(error.code, parsed.get("message") or parsed.get("error_description") or "Request failed")
        except urlerror.URLError:
            raise ProviderAPIError(502, "Google profile 정보를 가져오지 못했습니다.")

    def _verify_google_id_token(self, token_value):
        if not token_value or not google_id_token or not google_requests:
            return {}
        try:
            claims = google_id_token.verify_oauth2_token(
                token_value,
                google_requests.Request(),
                GOOGLE_OAUTH_CLIENT_ID,
            )
            return claims if isinstance(claims, dict) else {}
        except Exception:
            raise ProviderAPIError(401, "Google ID 토큰 검증에 실패했습니다.")

    def do_GET(self):
        parsed = urlparse.urlparse(self.path)
        path = parsed.path

        if path == "/api/analytics/counter":
            self.handle_visit_counter_get()
            return

        if path == "/api/auth/session":
            self.handle_auth_session()
            return

        if path == "/api/prompt-access/status":
            self.handle_prompt_access_status()
            return

        if path == "/api/auth/google/start":
            self.handle_google_auth_start(parsed)
            return

        if path == "/api/auth/google/callback":
            self.handle_google_auth_callback(parsed)
            return

        super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.end_headers()

    def do_POST(self):
        path = self.path.split("?", 1)[0]

        if path == "/api/analytics/visit":
            self.handle_visit_counter_hit()
            return

        if path == "/api/dev-login":
            self.handle_dev_login()
            return

        if path == "/api/auth/logout":
            self.handle_auth_logout()
            return

        if path == "/api/auth/complete":
            self.handle_auth_complete()
            return

        if path == "/api/prompt-forge":
            self.handle_prompt_forge()
            return

        if path == "/api/prompt-tailor-live":
            self.handle_prompt_tailor_live()
            return

        if path == "/api/prompt-translate-live":
            self.handle_prompt_translate_live()
            return

        if path == "/api/prompt-access/redeem":
            self.handle_prompt_access_redeem()
            return

        if path == "/api/prompt-access/admin/create-code":
            self.handle_prompt_access_admin_create_code()
            return

        if path == "/api/extension/status":
            self.handle_extension_status()
            return

        if path == "/api/extension/redeem":
            self.handle_extension_redeem()
            return

        if path == "/api/extension/prompt-tailor":
            self.handle_extension_prompt_tailor()
            return

        if path == "/api/extension/prompt-translate":
            self.handle_extension_prompt_translate()
            return

        self._send_json(404, {"ok": False, "message": "Unknown endpoint"})

    def handle_auth_session(self):
        session_payload = self._get_current_session()
        self._send_json(
            200,
            {
                "ok": True,
                "configured": self._google_oauth_configured(),
                "authenticated": bool(session_payload),
                "method": (session_payload or {}).get("auth_method", ""),
                "user": (session_payload or {}).get("user", ""),
                "email": (session_payload or {}).get("email", ""),
                "picture": (session_payload or {}).get("picture", ""),
            },
        )

    def handle_visit_counter_get(self):
        counter = get_visit_counter(increment=False)
        self._send_json(200, {"ok": True, **counter})

    def handle_visit_counter_hit(self):
        counter = get_visit_counter(increment=True)
        self._send_json(200, {"ok": True, **counter})

    def _ensure_prompt_access_state(self):
        with PROMPT_ACCESS_LOCK:
            PROMPT_ACCESS_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
            if not PROMPT_ACCESS_STATE_PATH.exists():
                PROMPT_ACCESS_STATE_PATH.write_text(
                    json.dumps({"users": {}, "license_codes": {}, "updated_at": 0}, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

    def _load_prompt_access_state(self):
        self._ensure_prompt_access_state()
        with PROMPT_ACCESS_LOCK:
            try:
                data = json.loads(PROMPT_ACCESS_STATE_PATH.read_text(encoding="utf-8") or "{}")
            except json.JSONDecodeError:
                data = {}
            if not isinstance(data, dict):
                data = {}
            data.setdefault("users", {})
            data.setdefault("extension_clients", {})
            data.setdefault("license_codes", {})
            data.setdefault("updated_at", 0)
            return data

    def _save_prompt_access_state(self, state):
        state["updated_at"] = int(time.time())
        with PROMPT_ACCESS_LOCK:
            PROMPT_ACCESS_STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def _get_account_key(self, session_payload):
        email = str((session_payload or {}).get("email", "")).strip().lower()
        if email:
            return f"email:{email}"
        auth_method = str((session_payload or {}).get("auth_method", "")).strip() or "session"
        user = str((session_payload or {}).get("user", "")).strip() or "unknown"
        return f"{auth_method}:{user.lower()}"

    def _get_or_create_prompt_user(self, state, session_payload):
        account_key = self._get_account_key(session_payload)
        users = state.setdefault("users", {})
        user_record = users.setdefault(
            account_key,
            {
                "user": str((session_payload or {}).get("user", "")).strip(),
                "email": str((session_payload or {}).get("email", "")).strip().lower(),
                "free_prompt_calls_used": 0,
                "token_balance": 0,
                "token_spent": 0,
                "last_charge_tokens": 0,
                "redeemed_codes": [],
                "created_at": int(time.time()),
                "updated_at": int(time.time()),
            },
        )
        user_record["user"] = str((session_payload or {}).get("user", "")).strip()
        user_record["email"] = str((session_payload or {}).get("email", "")).strip().lower()
        user_record["updated_at"] = int(time.time())
        return account_key, user_record

    def _current_prompt_cycle(self):
        return time.strftime("%Y-%m", time.localtime())

    def _sync_prompt_cycle(self, record):
        current_cycle = self._current_prompt_cycle()
        if str(record.get("monthly_cycle", "")).strip() != current_cycle:
            record["monthly_cycle"] = current_cycle
            record["monthly_used"] = 0
        return current_cycle

    def _enforce_char_limit(self, text, *, field_label="입력"):
        if len(str(text or "").strip()) > PROMPT_CHAR_LIMIT:
            raise ProviderAPIError(400, f"{field_label}은 {PROMPT_CHAR_LIMIT}자 이하로 입력하세요.")

    def _build_prompt_access_payload(self, session_payload):
        if not session_payload:
            return {
                "ok": True,
                "authenticated": False,
                "plan": "free",
                "free_limit": PROMPT_FREE_LIMIT,
                "free_used": 0,
                "free_remaining": PROMPT_FREE_LIMIT,
                "monthly_limit": PROMPT_MONTHLY_LIMIT,
                "monthly_used": 0,
                "monthly_remaining": PROMPT_MONTHLY_LIMIT,
                "char_limit": PROMPT_CHAR_LIMIT,
                "pro_monthly_usd": PROMPT_PRO_MONTHLY_USD,
                "pro_yearly_usd": PROMPT_PRO_YEARLY_USD,
                "token_balance": 0,
                "token_spent": 0,
                "last_charge_tokens": 0,
                "billing_unit_tokens": PROMPT_BILLING_UNIT_TOKENS,
                "price_per_1k_tokens_usd": PROMPT_PRICE_PER_1K_TOKENS_USD,
                "can_use": False,
                "checkout_url": PROMPT_CHECKOUT_URL,
                "managed_label": self._get_managed_runtime("tailor")["label"],
                "message": f"로그인 후 무료 3회까지 바로 사용할 수 있습니다. 이후에는 Pro 월 ${PROMPT_PRO_MONTHLY_USD:.2f} 또는 연 ${PROMPT_PRO_YEARLY_USD:.0f}로 계속 사용할 수 있습니다.",
            }

        state = self._load_prompt_access_state()
        _, user_record = self._get_or_create_prompt_user(state, session_payload)
        self._sync_prompt_cycle(user_record)
        user_record.setdefault("plan", "free")
        self._save_prompt_access_state(state)
        plan = str(user_record.get("plan", "free")).strip() or "free"
        free_used = int(user_record.get("free_prompt_calls_used", 0) or 0)
        free_remaining = max(0, PROMPT_FREE_LIMIT - free_used)
        monthly_used = int(user_record.get("monthly_used", 0) or 0)
        monthly_remaining = max(0, PROMPT_MONTHLY_LIMIT - monthly_used)
        token_balance = int(user_record.get("token_balance", 0) or 0)
        token_spent = int(user_record.get("token_spent", 0) or 0)
        last_charge_tokens = int(user_record.get("last_charge_tokens", 0) or 0)
        can_use = monthly_remaining > 0 and (plan == "pro" or free_remaining > 0)
        if monthly_remaining <= 0:
            message = f"이번 달 사용량 {PROMPT_MONTHLY_LIMIT}회를 모두 사용했습니다. 다음 달에 다시 열리거나 상위 요금제를 따로 운영하세요."
        elif plan == "pro":
            message = f"Pro 활성화 상태입니다. 이번 달 {monthly_remaining}회 더 사용할 수 있고, 1회 입력은 {PROMPT_CHAR_LIMIT}자까지 가능합니다."
        elif free_remaining > 0:
            message = f"무료 {free_remaining}회가 남아 있습니다. 이후에는 Pro 월 ${PROMPT_PRO_MONTHLY_USD:.2f} 또는 연 ${PROMPT_PRO_YEARLY_USD:.0f}로 계속 사용할 수 있습니다."
        else:
            message = f"무료 3회를 모두 사용했어요. 계속 생성/번역하려면 Pro로 업그레이드하세요. Pro는 월 ${PROMPT_PRO_MONTHLY_USD:.2f}, 연 ${PROMPT_PRO_YEARLY_USD:.0f}이며 월 {PROMPT_MONTHLY_LIMIT}회, 1회 {PROMPT_CHAR_LIMIT}자까지 사용할 수 있습니다."
        return {
            "ok": True,
            "authenticated": True,
            "plan": plan,
            "free_limit": PROMPT_FREE_LIMIT,
            "free_used": free_used,
            "free_remaining": free_remaining,
            "monthly_limit": PROMPT_MONTHLY_LIMIT,
            "monthly_used": monthly_used,
            "monthly_remaining": monthly_remaining,
            "char_limit": PROMPT_CHAR_LIMIT,
            "pro_monthly_usd": PROMPT_PRO_MONTHLY_USD,
            "pro_yearly_usd": PROMPT_PRO_YEARLY_USD,
            "token_balance": token_balance,
            "token_spent": token_spent,
            "last_charge_tokens": last_charge_tokens,
            "billing_unit_tokens": PROMPT_BILLING_UNIT_TOKENS,
            "price_per_1k_tokens_usd": PROMPT_PRICE_PER_1K_TOKENS_USD,
            "can_use": can_use,
            "checkout_url": PROMPT_CHECKOUT_URL,
            "managed_label": self._get_managed_runtime("tailor")["label"],
            "message": message,
        }

    def _require_prompt_access(self, session_payload):
        payload = self._build_prompt_access_payload(session_payload)
        if not payload.get("can_use"):
            raise ProviderAPIError(402, payload.get("message") or "무료 사용량이 모두 소진되었습니다.")
        return payload

    def _record_prompt_usage(self, session_payload, usage):
        state = self._load_prompt_access_state()
        _, user_record = self._get_or_create_prompt_user(state, session_payload)
        self._sync_prompt_cycle(user_record)
        free_used = int(user_record.get("free_prompt_calls_used", 0) or 0)
        charged_tokens = 0

        if str(user_record.get("plan", "free")).strip() != "pro" and free_used < PROMPT_FREE_LIMIT:
            user_record["free_prompt_calls_used"] = free_used + 1
        user_record["monthly_used"] = int(user_record.get("monthly_used", 0) or 0) + 1
        user_record["last_charge_tokens"] = charged_tokens
        user_record["updated_at"] = int(time.time())
        self._save_prompt_access_state(state)
        return self._build_prompt_access_payload(session_payload)

    def _get_managed_runtime(self, feature):
        if feature == "translate":
            provider = PROMPT_TRANSLATE_PROVIDER
            model = PROMPT_TRANSLATE_MODEL
            api_key = PROMPT_TRANSLATE_API_KEY
        else:
            provider = PROMPT_TAILOR_PROVIDER
            model = PROMPT_TAILOR_MODEL
            api_key = PROMPT_TAILOR_API_KEY
        return {
            "provider": provider,
            "model": model,
            "api_key": api_key,
            "label": f"{provider}:{model}",
        }

    def _estimate_mock_usage(self, source_text, output_text):
        input_tokens = max(1, len(str(source_text or "").strip()) // 4)
        output_tokens = max(1, len(str(output_text or "").strip()) // 4)
        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        }

    def _build_mock_tailor_prompt(self, user_prompt):
        compact = str(user_prompt or "").strip()
        return (
            "[Role]\n"
            "You are a pragmatic specialist who turns rough requests into clear execution plans.\n\n"
            "[Task]\n"
            "Rewrite the user's request into a concrete prompt with specific output requirements.\n\n"
            "[Input]\n"
            f"{compact}\n\n"
            "[Output]\n"
            "1. Short conclusion\n"
            "2. Prioritized action steps\n"
            "3. Risks or assumptions\n"
            "4. Final deliverable format"
        )

    def _build_mock_translation(self, source_text, source_language, target_language, preserve_structure):
        target_label = "Korean" if target_language == "ko" else "English"
        preserve_label = "yes" if preserve_structure else "no"
        return (
            f"[Mock Translation: {source_language} -> {target_language}]\n"
            f"[Target Language]\n{target_label}\n\n"
            f"[Preserve Structure]\n{preserve_label}\n\n"
            f"{str(source_text or '').strip()}"
        )

    def _validate_extension_client_id(self, client_id):
        value = str(client_id or "").strip()
        if not value:
            raise ProviderAPIError(400, "clientId가 필요합니다.")
        allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        if any(char not in allowed for char in value):
            raise ProviderAPIError(400, "clientId 형식이 올바르지 않습니다.")
        return value

    def _get_or_create_extension_client(self, state, client_id):
        client_key = self._validate_extension_client_id(client_id)
        clients = state.setdefault("extension_clients", {})
        client_record = clients.setdefault(
            client_key,
            {
                "plan": "free",
                "prompt_studio_used": 0,
                "monthly_used": 0,
                "monthly_cycle": self._current_prompt_cycle(),
                "redeemed_codes": [],
                "created_at": int(time.time()),
                "updated_at": int(time.time()),
            },
        )
        self._sync_prompt_cycle(client_record)
        client_record["updated_at"] = int(time.time())
        return client_key, client_record

    def _build_extension_access_payload(self, client_id):
        state = self._load_prompt_access_state()
        _, client_record = self._get_or_create_extension_client(state, client_id)
        self._save_prompt_access_state(state)
        used = int(client_record.get("prompt_studio_used", 0) or 0)
        monthly_used = int(client_record.get("monthly_used", 0) or 0)
        monthly_remaining = max(0, PROMPT_MONTHLY_LIMIT - monthly_used)
        plan = str(client_record.get("plan", "free")).strip() or "free"
        can_use = monthly_remaining > 0 and (plan == "pro" or used < PROMPT_FREE_LIMIT)
        remaining = max(0, PROMPT_FREE_LIMIT - used)
        message = (
            f"이번 달 사용량 {PROMPT_MONTHLY_LIMIT}회를 모두 사용했습니다. 다음 달에 다시 열립니다."
            if monthly_remaining <= 0
            else (
                f"Pro 활성화 상태입니다. 이번 달 {monthly_remaining}회 더 사용할 수 있고, 1회 입력은 {PROMPT_CHAR_LIMIT}자까지 가능합니다."
                if plan == "pro"
                else (
                    f"무료 {remaining}회가 남아 있습니다. 이후에는 Pro 월 ${PROMPT_PRO_MONTHLY_USD:.2f} 또는 연 ${PROMPT_PRO_YEARLY_USD:.0f}로 계속 사용할 수 있습니다."
                    if can_use
                    else f"무료 3회를 모두 사용했어요. 계속 생성/번역하려면 Pro로 업그레이드하세요. Pro는 월 ${PROMPT_PRO_MONTHLY_USD:.2f}, 연 ${PROMPT_PRO_YEARLY_USD:.0f}이며 월 {PROMPT_MONTHLY_LIMIT}회, 1회 {PROMPT_CHAR_LIMIT}자까지 사용할 수 있습니다."
                )
            )
        )
        return {
            "ok": True,
            "plan": plan,
            "free_limit": PROMPT_FREE_LIMIT,
            "used": used,
            "remaining": remaining,
            "monthly_limit": PROMPT_MONTHLY_LIMIT,
            "monthly_used": monthly_used,
            "monthly_remaining": monthly_remaining,
            "char_limit": PROMPT_CHAR_LIMIT,
            "pro_monthly_usd": PROMPT_PRO_MONTHLY_USD,
            "pro_yearly_usd": PROMPT_PRO_YEARLY_USD,
            "can_use": can_use,
            "checkout_url": PROMPT_CHECKOUT_URL,
            "managed_label": self._get_managed_runtime("tailor")["label"],
            "message": message,
        }

    def _require_extension_access(self, client_id):
        payload = self._build_extension_access_payload(client_id)
        if not payload.get("can_use"):
            raise ProviderAPIError(402, payload.get("message") or "무료 사용량이 모두 소진되었습니다.")
        return payload

    def _record_extension_usage(self, client_id):
        state = self._load_prompt_access_state()
        _, client_record = self._get_or_create_extension_client(state, client_id)
        plan = str(client_record.get("plan", "free")).strip() or "free"
        if plan != "pro":
            client_record["prompt_studio_used"] = int(client_record.get("prompt_studio_used", 0) or 0) + 1
        client_record["monthly_used"] = int(client_record.get("monthly_used", 0) or 0) + 1
        client_record["updated_at"] = int(time.time())
        self._save_prompt_access_state(state)
        return self._build_extension_access_payload(client_id)

    def handle_prompt_access_status(self):
        session_payload = self._get_current_session()
        self._send_json(200, self._build_prompt_access_payload(session_payload))

    def handle_prompt_access_redeem(self):
        try:
            session_payload = self._require_session()
            payload = self._read_json_payload()
            code = str(payload.get("code", "")).strip()
            if not code:
                raise ProviderAPIError(400, "업그레이드 코드를 입력하세요.")

            state = self._load_prompt_access_state()
            license_codes = state.setdefault("license_codes", {})
            code_record = license_codes.get(code)
            if not code_record:
                raise ProviderAPIError(404, "유효하지 않은 업그레이드 코드입니다.")
            if bool(code_record.get("redeemed")):
                raise ProviderAPIError(409, "이미 사용된 업그레이드 코드입니다.")

            _, user_record = self._get_or_create_prompt_user(state, session_payload)
            user_record["plan"] = str(code_record.get("plan", "pro")).strip() or "pro"
            user_record.setdefault("redeemed_codes", []).append(code)
            user_record["updated_at"] = int(time.time())
            code_record["redeemed"] = True
            code_record["redeemed_at"] = int(time.time())
            code_record["redeemed_by"] = self._get_account_key(session_payload)
            self._save_prompt_access_state(state)
            self._send_json(200, {"ok": True, "message": "Pro 업그레이드가 적용되었습니다.", "access": self._build_prompt_access_payload(session_payload)})
        except ProviderAPIError as error:
            self._send_json(error.status_code, {"ok": False, "message": error.message})

    def handle_prompt_access_admin_create_code(self):
        try:
            session_payload = self._require_session()
            if str(session_payload.get("auth_method", "")).strip() != "developer":
                raise ProviderAPIError(403, "개발자 마스터키 세션에서만 코드를 만들 수 있습니다.")
            payload = self._read_json_payload()
            plan = str(payload.get("plan", "pro")).strip() or "pro"
            note = str(payload.get("note", "")).strip()
            code = payload.get("code")
            if code:
                code = str(code).strip()
            else:
                code = f"PRO-{secrets.token_hex(4).upper()}"
            state = self._load_prompt_access_state()
            license_codes = state.setdefault("license_codes", {})
            if code in license_codes:
                raise ProviderAPIError(409, "이미 존재하는 코드입니다.")
            license_codes[code] = {
                "plan": plan,
                "note": note,
                "created_at": int(time.time()),
                "created_by": self._get_account_key(session_payload),
                "redeemed": False,
            }
            self._save_prompt_access_state(state)
            self._send_json(200, {"ok": True, "code": code, "plan": plan})
        except ProviderAPIError as error:
            self._send_json(error.status_code, {"ok": False, "message": error.message})

    def handle_extension_status(self):
        try:
            payload = self._read_json_payload()
            client_id = self._validate_extension_client_id(payload.get("clientId"))
            self._send_json(200, self._build_extension_access_payload(client_id))
        except ProviderAPIError as error:
            self._send_json(error.status_code, {"ok": False, "message": error.message})

    def handle_extension_redeem(self):
        try:
            payload = self._read_json_payload()
            client_id = self._validate_extension_client_id(payload.get("clientId"))
            code = str(payload.get("code", "")).strip()
            if not code:
                raise ProviderAPIError(400, "업그레이드 코드를 입력하세요.")

            state = self._load_prompt_access_state()
            _, client_record = self._get_or_create_extension_client(state, client_id)
            code_record = state.setdefault("license_codes", {}).get(code)
            if not code_record:
                raise ProviderAPIError(404, "유효하지 않은 업그레이드 코드입니다.")
            if bool(code_record.get("redeemed")):
                raise ProviderAPIError(409, "이미 사용된 업그레이드 코드입니다.")

            client_record["plan"] = str(code_record.get("plan", "pro")).strip() or "pro"
            client_record.setdefault("redeemed_codes", []).append(code)
            client_record["updated_at"] = int(time.time())
            code_record["redeemed"] = True
            code_record["redeemed_at"] = int(time.time())
            code_record["redeemed_by"] = f"extension:{client_id}"
            self._save_prompt_access_state(state)
            self._send_json(200, {"ok": True, "message": "Pro 업그레이드가 적용되었습니다.", "access": self._build_extension_access_payload(client_id)})
        except ProviderAPIError as error:
            self._send_json(error.status_code, {"ok": False, "message": error.message})

    def handle_google_auth_start(self, parsed):
        next_section = self._sanitize_next_section(urlparse.parse_qs(parsed.query).get("next", ["personalization"])[0])
        if not self._google_oauth_configured():
            self._send_redirect(self._build_post_auth_location(next_section, error_code="google_config_missing"))
            return

        state_token = self._create_google_oauth_state(next_section=next_section)
        auth_url = (
            "https://accounts.google.com/o/oauth2/v2/auth?"
            + urlparse.urlencode(
                {
                    "client_id": GOOGLE_OAUTH_CLIENT_ID,
                    "redirect_uri": self._build_google_redirect_uri(),
                    "response_type": "code",
                    "scope": "openid email profile",
                    "state": state_token,
                    "prompt": "select_account",
                }
            )
        )
        self._send_redirect(auth_url)

    def handle_google_auth_callback(self, parsed):
        query = urlparse.parse_qs(parsed.query)
        next_section = "personalization"
        state_token = str(query.get("state", [""])[0]).strip()
        code = str(query.get("code", [""])[0]).strip()
        oauth_error = str(query.get("error", [""])[0]).strip()
        state_payload = self._get_google_oauth_state(state_token)

        if state_payload:
            next_section = self._sanitize_next_section(state_payload.get("next_section"))

        if oauth_error:
            self._send_redirect_page(self._build_post_auth_location(next_section, error_code="google_denied"))
            return

        if not code or not state_payload:
            self._send_redirect_page(self._build_post_auth_location(next_section, error_code="google_state_mismatch"))
            return

        try:
            token_payload = self._post_form(
                "https://oauth2.googleapis.com/token",
                {
                    "code": code,
                    "client_id": GOOGLE_OAUTH_CLIENT_ID,
                    "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
                    "redirect_uri": self._build_google_redirect_uri(),
                    "grant_type": "authorization_code",
                },
            )
            access_token = str(token_payload.get("access_token", "")).strip()
            if not access_token:
                raise ProviderAPIError(401, "Google OAuth access token을 받지 못했습니다.")

            verified_claims = self._verify_google_id_token(str(token_payload.get("id_token", "")).strip())
            profile = self._get_json(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )

            email = str(profile.get("email") or verified_claims.get("email") or "").strip().lower()
            email_verified = bool(profile.get("email_verified") or verified_claims.get("email_verified"))
            if not email or not email_verified:
                raise ProviderAPIError(403, "이 앱은 이메일이 확인된 Google 계정만 허용합니다.")

            if GOOGLE_OAUTH_ALLOWED_EMAILS and email not in GOOGLE_OAUTH_ALLOWED_EMAILS:
                raise ProviderAPIError(403, "허용된 Google 계정이 아닙니다.")

            user_name = str(profile.get("name") or profile.get("given_name") or verified_claims.get("name") or email).strip()
            picture = str(profile.get("picture") or verified_claims.get("picture") or "").strip()
            session_token = self._create_session_token(
                user=user_name,
                email=email,
                picture=picture,
                auth_method="google",
            )
            session_cookie = self._build_cookie(SESSION_COOKIE_NAME, session_token, max_age=SESSION_TTL_SECONDS)
            self._send_redirect_page(
                self._build_post_auth_location(next_section, status="google"),
                cookie_headers=[session_cookie],
            )
        except ProviderAPIError as error:
            error_code = {
                401: "google_verify_failed",
                403: "google_not_allowed",
            }.get(error.status_code, "google_failed")
            self._send_redirect_page(self._build_post_auth_location(next_section, error_code=error_code))

    def handle_auth_complete(self):
        # Session is now set directly in the OAuth callback redirect.
        # This endpoint is kept for backward compatibility but simply confirms the current session.
        session_payload = self._get_current_session()
        if session_payload:
            self._send_json(200, {
                "ok": True,
                "method": session_payload.get("auth_method", "google"),
                "user": session_payload.get("user", ""),
                "email": session_payload.get("email", ""),
                "picture": session_payload.get("picture", ""),
            })
        else:
            self._send_json(401, {"ok": False, "message": "로그인 세션이 없습니다. 다시 로그인하세요."})

    def handle_dev_login(self):
        try:
            payload = self._read_json_payload()
        except ProviderAPIError as error:
            self._send_json(error.status_code, {"ok": False, "message": error.message})
            return

        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", "")).strip()

        if username == DEV_LOGIN_ID and password == DEV_LOGIN_PASSWORD:
            session_token = self._create_session_token(user=username, auth_method="developer")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Set-Cookie", self._build_cookie(SESSION_COOKIE_NAME, session_token, max_age=SESSION_TTL_SECONDS))
            body = json.dumps({"ok": True, "method": "developer", "user": username}).encode("utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self._send_json(401, {"ok": False, "message": "아이디 또는 비밀번호가 맞지 않습니다."})

    def handle_auth_logout(self):
        self.send_response(200)
        body = json.dumps({"ok": True, "message": "로그아웃되었습니다."}).encode("utf-8")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Set-Cookie", self._clear_cookie(SESSION_COOKIE_NAME))
        self.end_headers()
        self.wfile.write(body)

    def handle_prompt_forge(self):
        try:
            self._require_session()
            payload = self._read_json_payload()
            provider = str(payload.get("provider", "")).strip().lower()
            model = str(payload.get("model", "")).strip()
            label = str(payload.get("label", model or provider)).strip()
            api_key = str(payload.get("apiKey", "")).strip()
            system_prompt = str(payload.get("systemPrompt", "")).strip()
            user_prompt = str(payload.get("userPrompt", "")).strip()
            if isinstance(payload, dict) and "apiKey" in payload:
                payload["apiKey"] = None

            if not provider or not model or not api_key or not system_prompt or not user_prompt:
                raise ProviderAPIError(400, "provider, model, apiKey, systemPrompt, userPrompt가 모두 필요합니다.")

            prompt, usage = self._call_provider(provider, model, api_key, system_prompt, user_prompt)
            self._send_json(
                200,
                {
                    "ok": True,
                    "provider": provider,
                    "model": model,
                    "label": label,
                    "prompt": prompt,
                    "usage": usage,
                },
            )
        except ProviderAPIError as error:
            self._send_json(error.status_code, {"ok": False, "message": error.message})
        except Exception:
            self._send_json(500, {"ok": False, "message": "Live prompt generation failed on the server."})

    def handle_prompt_tailor_live(self):
        try:
            session_payload = self._require_session()
            payload = self._read_json_payload()
            system_prompt = str(payload.get("systemPrompt", "")).strip()
            user_prompt = str(payload.get("userPrompt", "")).strip()
            if not system_prompt or not user_prompt:
                raise ProviderAPIError(400, "systemPrompt와 userPrompt가 모두 필요합니다.")
            self._enforce_char_limit(user_prompt, field_label="프롬프트 입력")

            self._require_prompt_access(session_payload)
            runtime = self._get_managed_runtime("tailor")
            if PROMPT_DEV_MOCK and not runtime["api_key"]:
                prompt = self._build_mock_tailor_prompt(user_prompt)
                usage = self._estimate_mock_usage(user_prompt, prompt)
            else:
                if not runtime["provider"] or not runtime["model"] or not runtime["api_key"]:
                    raise ProviderAPIError(503, "PROMPT_TAILOR_PROVIDER, PROMPT_TAILOR_MODEL, PROMPT_TAILOR_API_KEY 환경변수를 먼저 설정하세요.")
                prompt, usage = self._call_provider(runtime["provider"], runtime["model"], runtime["api_key"], system_prompt, user_prompt)
            updated_access = self._record_prompt_usage(session_payload, usage)
            self._send_json(
                200,
                {
                    "ok": True,
                    "provider": runtime["provider"],
                    "model": runtime["model"],
                    "label": runtime["label"],
                    "prompt": prompt,
                    "usage": usage,
                    "access": updated_access,
                },
            )
        except ProviderAPIError as error:
            session_payload = self._get_current_session()
            response = {"ok": False, "message": error.message}
            if session_payload:
                response["access"] = self._build_prompt_access_payload(session_payload)
            self._send_json(error.status_code, response)
        except Exception:
            self._send_json(500, {"ok": False, "message": "Managed prompt generation failed on the server."})

    def handle_prompt_translate_live(self):
        try:
            session_payload = self._require_session()
            payload = self._read_json_payload()
            source_text = str(payload.get("text", "")).strip()
            source_language = str(payload.get("sourceLanguage", "auto")).strip() or "auto"
            target_language = str(payload.get("targetLanguage", "ko")).strip() or "ko"
            preserve_structure = bool(payload.get("preserveStructure", True))
            if not source_text:
                raise ProviderAPIError(400, "번역할 텍스트가 필요합니다.")
            self._enforce_char_limit(source_text, field_label="번역할 프롬프트")

            self._require_prompt_access(session_payload)
            runtime = self._get_managed_runtime("translate")
            if PROMPT_DEV_MOCK and not runtime["api_key"]:
                translated = self._build_mock_translation(source_text, source_language, target_language, preserve_structure)
                usage = self._estimate_mock_usage(source_text, translated)
            else:
                if not runtime["provider"] or not runtime["model"] or not runtime["api_key"]:
                    raise ProviderAPIError(503, "PROMPT_TRANSLATE_PROVIDER, PROMPT_TRANSLATE_MODEL, PROMPT_TRANSLATE_API_KEY 환경변수를 먼저 설정하세요.")

                system_prompt = (
                    "You are a professional prompt translator.\n"
                    "Preserve intent, section structure, and operational constraints.\n"
                    "Return only the translated prompt, with no explanation."
                )
                user_prompt = (
                    f"[Source Language]\n{source_language}\n\n"
                    f"[Target Language]\n{target_language}\n\n"
                    f"[Preserve Structure]\n{'yes' if preserve_structure else 'no'}\n\n"
                    f"[Prompt]\n{source_text}"
                )
                translated, usage = self._call_provider(runtime["provider"], runtime["model"], runtime["api_key"], system_prompt, user_prompt)
            updated_access = self._record_prompt_usage(session_payload, usage)
            self._send_json(
                200,
                {
                    "ok": True,
                    "translation": translated,
                    "usage": usage,
                    "access": updated_access,
                    "provider": runtime["provider"],
                    "model": runtime["model"],
                    "label": runtime["label"],
                },
            )
        except ProviderAPIError as error:
            session_payload = self._get_current_session()
            response = {"ok": False, "message": error.message}
            if session_payload:
                response["access"] = self._build_prompt_access_payload(session_payload)
            self._send_json(error.status_code, response)
        except Exception:
            self._send_json(500, {"ok": False, "message": "Managed prompt translation failed on the server."})

    def handle_extension_prompt_tailor(self):
        try:
            payload = self._read_json_payload()
            client_id = self._validate_extension_client_id(payload.get("clientId"))
            system_prompt = str(payload.get("systemPrompt", "")).strip()
            user_prompt = str(payload.get("userPrompt", "")).strip()
            if not system_prompt or not user_prompt:
                raise ProviderAPIError(400, "systemPrompt와 userPrompt가 모두 필요합니다.")
            self._enforce_char_limit(user_prompt, field_label="프롬프트 입력")

            self._require_extension_access(client_id)
            runtime = self._get_managed_runtime("tailor")
            if PROMPT_DEV_MOCK and not runtime["api_key"]:
                prompt = self._build_mock_tailor_prompt(user_prompt)
                usage = self._estimate_mock_usage(user_prompt, prompt)
            else:
                if not runtime["provider"] or not runtime["model"] or not runtime["api_key"]:
                    raise ProviderAPIError(503, "PROMPT_TAILOR_PROVIDER, PROMPT_TAILOR_MODEL, PROMPT_TAILOR_API_KEY 환경변수를 먼저 설정하세요.")
                prompt, usage = self._call_provider(runtime["provider"], runtime["model"], runtime["api_key"], system_prompt, user_prompt)
            updated_access = self._record_extension_usage(client_id)
            self._send_json(200, {"ok": True, "prompt": prompt, "usage": usage, "access": updated_access, "label": runtime["label"]})
        except ProviderAPIError as error:
            response = {"ok": False, "message": error.message}
            payload = locals().get("payload") if "payload" in locals() else {}
            client_id = str(payload.get("clientId", "")).strip() if isinstance(payload, dict) else ""
            if client_id:
                response["access"] = self._build_extension_access_payload(client_id)
            self._send_json(error.status_code, response)
        except Exception:
            self._send_json(500, {"ok": False, "message": "Extension prompt generation failed on the server."})

    def handle_extension_prompt_translate(self):
        try:
            payload = self._read_json_payload()
            client_id = self._validate_extension_client_id(payload.get("clientId"))
            source_text = str(payload.get("text", "")).strip()
            source_language = str(payload.get("sourceLanguage", "auto")).strip() or "auto"
            target_language = str(payload.get("targetLanguage", "ko")).strip() or "ko"
            preserve_structure = bool(payload.get("preserveStructure", True))
            if not source_text:
                raise ProviderAPIError(400, "번역할 텍스트가 필요합니다.")
            self._enforce_char_limit(source_text, field_label="번역할 프롬프트")

            self._require_extension_access(client_id)
            runtime = self._get_managed_runtime("translate")
            if PROMPT_DEV_MOCK and not runtime["api_key"]:
                translated = self._build_mock_translation(source_text, source_language, target_language, preserve_structure)
                usage = self._estimate_mock_usage(source_text, translated)
            else:
                if not runtime["provider"] or not runtime["model"] or not runtime["api_key"]:
                    raise ProviderAPIError(503, "PROMPT_TRANSLATE_PROVIDER, PROMPT_TRANSLATE_MODEL, PROMPT_TRANSLATE_API_KEY 환경변수를 먼저 설정하세요.")

                system_prompt = (
                    "You are a professional prompt translator.\n"
                    "Preserve intent, section structure, and operational constraints.\n"
                    "Return only the translated prompt, with no explanation."
                )
                user_prompt = (
                    f"[Source Language]\n{source_language}\n\n"
                    f"[Target Language]\n{target_language}\n\n"
                    f"[Preserve Structure]\n{'yes' if preserve_structure else 'no'}\n\n"
                    f"[Prompt]\n{source_text}"
                )
                translated, usage = self._call_provider(runtime["provider"], runtime["model"], runtime["api_key"], system_prompt, user_prompt)
            updated_access = self._record_extension_usage(client_id)
            self._send_json(200, {"ok": True, "translation": translated, "usage": usage, "access": updated_access, "label": runtime["label"]})
        except ProviderAPIError as error:
            response = {"ok": False, "message": error.message}
            payload = locals().get("payload") if "payload" in locals() else {}
            client_id = str(payload.get("clientId", "")).strip() if isinstance(payload, dict) else ""
            if client_id:
                response["access"] = self._build_extension_access_payload(client_id)
            self._send_json(error.status_code, response)
        except Exception:
            self._send_json(500, {"ok": False, "message": "Extension prompt translation failed on the server."})

    def _call_provider(self, provider, model, api_key, system_prompt, user_prompt):
        if provider == "openai":
            return self._call_openai(model, api_key, system_prompt, user_prompt)
        if provider == "anthropic":
            return self._call_anthropic(model, api_key, system_prompt, user_prompt)
        if provider == "google":
            return self._call_google(model, api_key, system_prompt, user_prompt)
        if provider == "deepseek":
            return self._call_deepseek(model, api_key, system_prompt, user_prompt)
        raise ProviderAPIError(400, f"{provider} provider는 아직 지원하지 않습니다.")

    def _post_json(self, url, headers, payload):
        request = urlrequest.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urlrequest.urlopen(request, timeout=60) as response:
                raw = response.read()
                return json.loads(raw.decode("utf-8") or "{}")
        except urlerror.HTTPError as error:
            body = error.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(body or "{}")
            except json.JSONDecodeError:
                parsed = {"message": body[:400] or "Provider request failed"}
            raise ProviderAPIError(error.code, parsed.get("message") or parsed.get("error", {}).get("message") or "Provider request failed")
        except urlerror.URLError:
            raise ProviderAPIError(502, "Provider API에 연결하지 못했습니다.")

    def _call_openai(self, model, api_key, system_prompt, user_prompt):
        payload = self._post_json(
            "https://api.openai.com/v1/responses",
            {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            {
                "model": model,
                "input": [
                    {
                        "role": "system",
                        "content": [{"type": "input_text", "text": system_prompt}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "input_text", "text": user_prompt}],
                    },
                ],
            },
        )
        prompt = self._extract_openai_text(payload)
        usage = payload.get("usage", {}) or {}
        return prompt, {
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "total_tokens": usage.get("total_tokens"),
        }

    def _call_anthropic(self, model, api_key, system_prompt, user_prompt):
        payload = self._post_json(
            "https://api.anthropic.com/v1/messages",
            {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            {
                "model": model,
                "max_tokens": 1800,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            },
        )
        content = payload.get("content", []) or []
        prompt = "\n".join(
            item.get("text", "").strip()
            for item in content
            if isinstance(item, dict) and item.get("type") == "text" and item.get("text")
        ).strip()
        if not prompt:
            raise ProviderAPIError(502, "Anthropic 응답에서 텍스트를 추출하지 못했습니다.")
        usage = payload.get("usage", {}) or {}
        return prompt, {
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "total_tokens": (usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0),
        }

    def _call_google(self, model, api_key, system_prompt, user_prompt):
        payload = self._post_json(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            {
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
            },
            {
                "contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}],
            },
        )
        prompt = "\n".join(
            part.get("text", "").strip()
            for candidate in payload.get("candidates", []) or []
            for part in ((candidate.get("content") or {}).get("parts") or [])
            if isinstance(part, dict) and part.get("text")
        ).strip()
        if not prompt:
            raise ProviderAPIError(502, "Gemini 응답에서 텍스트를 추출하지 못했습니다.")
        usage = payload.get("usageMetadata", {}) or {}
        return prompt, {
            "input_tokens": usage.get("promptTokenCount"),
            "output_tokens": usage.get("candidatesTokenCount"),
            "total_tokens": usage.get("totalTokenCount"),
        }

    def _call_deepseek(self, model, api_key, system_prompt, user_prompt):
        payload = self._post_json(
            "https://api.deepseek.com/chat/completions",
            {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
            },
        )
        prompt = (
            ((payload.get("choices") or [{}])[0].get("message") or {}).get("content", "").strip()
        )
        if not prompt:
            raise ProviderAPIError(502, "DeepSeek 응답에서 텍스트를 추출하지 못했습니다.")
        usage = payload.get("usage", {}) or {}
        return prompt, {
            "input_tokens": usage.get("prompt_tokens"),
            "output_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
        }

    def _extract_openai_text(self, payload):
        if isinstance(payload.get("output_text"), str) and payload.get("output_text").strip():
            return payload.get("output_text").strip()

        chunks = []
        for item in payload.get("output", []) or []:
            for content in item.get("content", []) or []:
                if not isinstance(content, dict):
                    continue
                text = content.get("text")
                if text:
                    chunks.append(str(text).strip())
        prompt = "\n".join(chunk for chunk in chunks if chunk).strip()
        if not prompt:
            raise ProviderAPIError(502, "OpenAI 응답에서 텍스트를 추출하지 못했습니다.")
        return prompt


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), StaticHandler)
    print(f"Serving {ROOT} at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
