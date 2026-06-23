"""Endpoint test: the /v1/extract route applies the last-N-messages cap.

Runs against the deterministic mock backend (no model download). Stdlib unittest
+ FastAPI TestClient (httpx). Env is set before importing/reloading ``server`` so
its module-level settings pick up the test config.
"""

from __future__ import annotations

import importlib
import os
import unittest


class TestExtractEndpointMessageCap(unittest.TestCase):
    def _client(self, max_messages: str):
        os.environ["CLAIM_EXTRACTOR_MOCK"] = "1"
        os.environ["CLAIM_EXTRACTOR_MAX_MESSAGES"] = max_messages
        import server

        importlib.reload(server)
        from fastapi.testclient import TestClient

        return TestClient(server.app)

    def tearDown(self) -> None:
        os.environ.pop("CLAIM_EXTRACTOR_MOCK", None)
        os.environ.pop("CLAIM_EXTRACTOR_MAX_MESSAGES", None)

    def test_only_last_n_messages_reach_the_model(self) -> None:
        client = self._client("2")
        messages = [{"role": "user", "content": f"u{i}"} for i in range(5)]
        res = client.post("/v1/extract", json={"messages": messages})
        self.assertEqual(res.status_code, 200)
        # mock emits one intent per user message it actually sees → only the last 2.
        intents = [i["content"] for i in res.json()["intents"]]
        self.assertEqual(intents, ["u3", "u4"])

    def test_zero_means_all_messages(self) -> None:
        client = self._client("0")
        messages = [{"role": "user", "content": f"u{i}"} for i in range(5)]
        res = client.post("/v1/extract", json={"messages": messages})
        self.assertEqual(res.status_code, 200)
        intents = [i["content"] for i in res.json()["intents"]]
        self.assertEqual(intents, ["u0", "u1", "u2", "u3", "u4"])


class TestOrbitalsExtractEndpoint(unittest.TestCase):
    """The orbitals-contract route accepts `conversation` and wraps the result so
    Ratel can swap between this sidecar and the hosted endpoint by URL alone."""

    def _client(self, max_messages: str = "0"):
        os.environ["CLAIM_EXTRACTOR_MOCK"] = "1"
        os.environ["CLAIM_EXTRACTOR_MAX_MESSAGES"] = max_messages
        import server

        importlib.reload(server)
        from fastapi.testclient import TestClient

        return TestClient(server.app)

    def tearDown(self) -> None:
        os.environ.pop("CLAIM_EXTRACTOR_MOCK", None)
        os.environ.pop("CLAIM_EXTRACTOR_MAX_MESSAGES", None)

    def test_wraps_result_in_extractions_with_usage_and_timing(self) -> None:
        client = self._client()
        res = client.post(
            "/orbitals/claim-extractor/extract",
            json={"conversation": [{"role": "user", "content": "add OAuth"}]},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual([i["content"] for i in body["extractions"]["intents"]], ["add OAuth"])
        self.assertIn("claims", body["extractions"])
        self.assertIn("model", body)
        self.assertIn("usage", body)
        self.assertEqual(
            set(body["usage"]), {"prompt_tokens", "completion_tokens", "total_tokens"}
        )
        self.assertIn("time_taken", body)

    def test_applies_the_message_cap(self) -> None:
        client = self._client("2")
        conversation = [{"role": "user", "content": f"u{i}"} for i in range(5)]
        res = client.post("/orbitals/claim-extractor/extract", json={"conversation": conversation})
        self.assertEqual(res.status_code, 200)
        intents = [i["content"] for i in res.json()["extractions"]["intents"]]
        self.assertEqual(intents, ["u3", "u4"])

    def test_accepts_a_bare_string_conversation(self) -> None:
        client = self._client()
        res = client.post(
            "/orbitals/claim-extractor/extract", json={"conversation": "just a string"}
        )
        self.assertEqual(res.status_code, 200)
        intents = [i["content"] for i in res.json()["extractions"]["intents"]]
        self.assertEqual(intents, ["just a string"])

    def test_legacy_v1_route_still_returns_unwrapped(self) -> None:
        client = self._client()
        res = client.post("/v1/extract", json={"messages": [{"role": "user", "content": "hi"}]})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        # Old shape: claims/intents at the top level, no `extractions` wrapper.
        self.assertNotIn("extractions", body)
        self.assertEqual([i["content"] for i in body["intents"]], ["hi"])


class TestNormalizeEvidence(unittest.TestCase):
    """`_normalize` must carry the model's evidence spans into the wire contract."""

    def _server(self):
        os.environ["CLAIM_EXTRACTOR_MOCK"] = "1"
        import server

        importlib.reload(server)
        return server

    def tearDown(self) -> None:
        os.environ.pop("CLAIM_EXTRACTOR_MOCK", None)

    def test_carries_evidence_from_strings_and_objects(self) -> None:
        server = self._server()
        result = {
            "extractions": {
                "claims": [{"subtype": "factoid", "content": "c1", "evidences": ["span a"]}],
                "intents": [
                    {"content": "i1", "evidences": [{"text": "span b"}]},  # object-shaped
                    {"content": "i2"},  # none → field omitted
                ],
            }
        }
        out = server._normalize(result)
        self.assertEqual(out["claims"][0]["evidences"], ["span a"])
        self.assertEqual(out["intents"][0]["evidences"], ["span b"])
        self.assertNotIn("evidences", out["intents"][1])


if __name__ == "__main__":
    unittest.main()
