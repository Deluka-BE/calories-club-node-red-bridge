import test from "node:test";
import assert from "node:assert/strict";
import { buildClientRegistrationRequest } from "../src/oauth.js";

test("dynamic client registration includes the Calories app and a valid redirect_uris array", () => {
  const request = buildClientRegistrationRequest({
    scopes: "read:entries write:entries"
  });

  assert.equal(request.app, "calories");
  assert.ok(Array.isArray(request.redirect_uris));
  assert.ok(request.redirect_uris.length > 0);
  assert.doesNotThrow(() => new URL(request.redirect_uris[0]));
  assert.deepEqual(request.redirect_uris, ["http://127.0.0.1/callback"]);
});
