"""Offline regression checks for the privileged branch cleanup workflow."""
import io
import json
import os
from pathlib import Path
import textwrap
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/delete-merged-branch.yml"
SOURCE = textwrap.dedent(WORKFLOW.read_text().split("        run: |\n", 1)[1])


class CleanupTests(unittest.TestCase):
    def execute(self, *, merged=True, fork=False, branch="ops/test", protected=False,
                advanced=False, missing=False, status=None, default_branch="main", base_branch="main"):
        event = {"repository": {"full_name": "THEPLUS007/travel-blocks-ai", "default_branch": default_branch},
                 "pull_request": {"merged": merged, "base": {"ref": base_branch},
                                  "head": {"ref": branch, "sha": "merged-head", "repo": {
                                      "full_name": "fork/repo" if fork else "THEPLUS007/travel-blocks-ai"}}}}
        calls = []

        def urlopen(request, timeout):
            self.assertEqual(timeout, 20)
            calls.append((request.method, request.full_url))
            if request.method == "GET":
                if missing or status:
                    raise HTTPError(request.full_url, status or 404, "fixture", {}, None)
                return io.BytesIO(json.dumps({"protected": protected, "commit": {
                    "sha": "new-head" if advanced else "merged-head"}}).encode())
            self.assertEqual(request.method, "DELETE")
            return io.BytesIO(b"")

        with patch.dict(os.environ, {"GITHUB_EVENT_PATH": "fixture-event", "GH_TOKEN": "fixture-token"}), \
             patch("builtins.open", return_value=io.StringIO(json.dumps(event))), \
             patch("urllib.request.urlopen", side_effect=urlopen), patch("builtins.print"):
            exec(compile(SOURCE, str(WORKFLOW), "exec"), {})
        return calls

    def test_merged_branch_deleted_with_encoded_path(self):
        calls = self.execute(branch="ops/test-branch")
        self.assertEqual([method for method, _ in calls], ["GET", "DELETE"])
        self.assertTrue(calls[1][1].endswith("/git/refs/heads/ops%2Ftest-branch"))

    def test_unmerged_is_preserved(self):
        self.assertEqual(self.execute(merged=False), [])

    def test_fork_is_preserved(self):
        self.assertEqual(self.execute(fork=True), [])

    def test_main_is_preserved(self):
        self.assertEqual(self.execute(branch="main"), [])

    def test_non_main_default_is_preserved(self):
        self.assertEqual(self.execute(branch="stable", default_branch="stable"), [])

    def test_non_main_target_is_preserved(self):
        self.assertEqual(self.execute(branch="release", base_branch="release"), [])

    def test_protected_is_preserved(self):
        self.assertEqual(len(self.execute(protected=True)), 1)

    def test_new_commits_are_preserved(self):
        self.assertEqual(len(self.execute(advanced=True)), 1)

    def test_already_deleted_is_success(self):
        self.assertEqual(len(self.execute(missing=True)), 1)

    def test_permission_failure_is_not_hidden(self):
        with self.assertRaises(HTTPError):
            self.execute(status=403)


if __name__ == "__main__":
    unittest.main()
