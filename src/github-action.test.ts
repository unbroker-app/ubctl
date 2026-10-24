import assert from "node:assert/strict";
import { test } from "node:test";
import { commentMetadata, planComment } from "./github-action";

test("GitHub action comments pin the plan to the exact PR head", () => {
  const body = planComment(
    {
      planId: "plan_123",
      destructive: false,
      summary: { add: 0, change: 1, destroy: 0, replace: 0 },
      changes: [
        {
          action: "change",
          address: "service.api.env.API_KEY",
          effect: "rebuild",
        },
      ],
      releases: [
        {
          serviceKey: "api",
          effect: "rebuild",
          commitSha: "abc123",
          imageRef: null,
          pinned: true,
        },
      ],
    },
    "deadbeef",
  );

  assert.match(body, /plan_123/);
  assert.match(body, /service\.api\.env\.API_KEY/);
  assert.match(body, /abc123/);
  assert.deepEqual(commentMetadata(body), {
    planId: "plan_123",
    sha: "deadbeef",
  });
});

test("unmarked or malformed comments cannot authorize apply", () => {
  assert.equal(commentMetadata("Plan `plan_bad` for commit `deadbeef`"), null);
  assert.equal(
    commentMetadata("<!-- unbroker-iac-plan -->\nno metadata"),
    null,
  );
});
