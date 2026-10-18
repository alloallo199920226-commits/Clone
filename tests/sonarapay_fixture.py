"""Isolated browser fixture. Never imported by the application."""
import os
os.environ["SONARAPAY_KEY"] = "isolated-browser-fixture-key"

import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import auth_backend
import sonarapay_client as client
from server import Handler, ThreadingHTTPServer

records = {}
calls = []
mode = "pending"


def create(order, otp=None):
    ref = "fixture-" + str(order["id"])
    calls.append(str(order["id"]))
    records.setdefault(ref, {"reference": ref, "transaction": {
        "status": "pending", "amount": order["amount_fcfa"], "currency": "XOF",
        "description": "IVECO:" + str(order["id"]),
        "countryCode": client.COUNTRY_CODES[client.country_prefix(order["payer_phone"])],
        "operatorId": order["operator_id"], "customerPhone": order["payer_phone"]}})
    if mode == "otp" and not otp:
        records[ref]["transaction"]["status"] = "otp_required"
        return {"reference": ref, "requiresOtp": True, "ussdCode": "*123#"}
    if otp:
        records[ref]["transaction"]["status"] = "pending"
    return {"reference": ref, "status": "pending"}


client.create = create
client.check = lambda reference: records[reference]


class FixtureHandler(Handler):
    def handle_api(self):
        global mode
        if self.path == "/api/test/sonarapay":
            body = self._read_json()
            if body is None:
                return
            mode = body.get("status", "pending")
            for record in records.values():
                record["transaction"]["status"] = mode
            with auth_backend.connect() as conn, conn.cursor() as cur:
                cur.execute("""UPDATE shineray_sonarapay_orders SET checked_at=now()-interval '1 minute',
                               initiated_at=now()-interval '1 minute' WHERE provider_reference=ANY(%s)""",
                            (list(records),))
            self._json(200, {"calls": len(calls), "unique_orders": len(set(calls))})
            return
        super().handle_api()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
    print(server.server_port, flush=True)
    server.serve_forever()
