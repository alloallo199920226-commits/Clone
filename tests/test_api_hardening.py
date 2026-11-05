"""Security regressions: no real provider calls and no customer balance writes."""
import concurrent.futures
import http.client
import json
import os
import socket
import threading
import unittest
import uuid

import api_limits
import auth_backend as db
from server import Handler, ThreadingHTTPServer


class RequestHardeningTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, raw):
        client = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        client.request("POST", "/api/auth/login", raw, {
            "Content-Type": "application/json",
            "Origin": f"http://127.0.0.1:{self.server.server_port}"})
        response = client.getresponse()
        result = response.status
        response.read()
        client.close()
        return result

    def test_rejects_ambiguous_nonfinite_deep_and_oversized_json(self):
        for body, status in (
            ('{"phone":"a","phone":"b"}', 400),
            ('{"amount":NaN}', 400), ('{"amount":Infinity}', 400),
            ('{"x":' + "[" * 1500 + "0" + "]" * 1500 + "}", 400),
            (json.dumps({"password": "x" * 17000}), 413),
        ):
            self.assertEqual(self.request(body), status)

    def test_connection_has_timeout(self):
        class CaptureHandler(Handler):
            timeout_seen = None

            def do_GET(self):
                type(self).timeout_seen = self.connection.gettimeout()
                self._json(200, {"ok": True})

        server = ThreadingHTTPServer(("127.0.0.1", 0), CaptureHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            client = http.client.HTTPConnection("127.0.0.1", server.server_port)
            client.request("GET", "/")
            response = client.getresponse()
            self.assertIn("frame-ancestors 'self'", response.getheader("Content-Security-Policy"))
            response.read()
            client.close()
            self.assertEqual(CaptureHandler.timeout_seen, 15)
        finally:
            server.shutdown()
            server.server_close()

    def test_saturated_server_rejects_connection_and_recovers(self):
        # Simulate occupied workers without creating 48 deliberately slow sockets.
        for _ in range(48):
            self.assertTrue(self.server._slots.acquire(blocking=False))
        try:
            client = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
            client.request("GET", "/")
            response = client.getresponse()
            self.assertEqual(response.status, 503)
            response.read()
            client.close()
        finally:
            for _ in range(48):
                self.server._slots.release()
        client = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        client.request("GET", "/")
        response = client.getresponse()
        self.assertEqual(response.status, 200)
        response.read()
        client.close()

    def test_malformed_session_is_rejected_before_database(self):
        from unittest.mock import patch
        with patch("auth_backend.connect", side_effect=AssertionError("Must not query")):
            for token in ("é" * 43, "\x00" * 43, "x", "a" * 129):
                self.assertIsNone(db.get_user_for_session(token))
                db.revoke_session(token)


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1",
                     "Development DB opt-in")
class PersistentThrottleTests(unittest.TestCase):
    def setUp(self):
        self.subject = uuid.uuid4().hex
        self.scopes = ["fixture-concurrency", "fixture-other"]

    def tearDown(self):
        with db.connect() as conn:
            conn.execute("DELETE FROM shineray_console_login_attempts WHERE client_hash=ANY(%s)",
                         ([api_limits.key(scope, self.subject) for scope in self.scopes],))

    def test_concurrency_persistence_scope_separation_and_expiry(self):
        def attempt(_):
            try:
                api_limits.consume(self.scopes[0], self.subject, limit=5, seconds=60)
                return 200
            except db.AuthError as error:
                return error.status

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            results = list(pool.map(attempt, range(10)))
        self.assertEqual(results.count(200), 5)
        self.assertEqual(results.count(429), 5)
        self.assertEqual(attempt(None), 429)
        api_limits.consume(self.scopes[1], self.subject, limit=5, seconds=60)
        with db.connect() as conn:
            conn.execute("""UPDATE shineray_console_login_attempts
                SET window_start=now()-interval '61 seconds' WHERE client_hash=%s""",
                (api_limits.key(self.scopes[0], self.subject),))
        self.assertEqual(attempt(None), 200)
