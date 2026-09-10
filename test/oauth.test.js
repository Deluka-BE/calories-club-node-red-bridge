import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClientRegistrationRequest,
  buildClientRegistrationUrl,
  buildDeviceAuthorizationRequest
} from "../src/oauth.js";

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

test("dynamic client registration URL includes the Calories app query parameter", () => {
  const url = new URL(buildClientRegistrationUrl("https://api.recordo.app/api/mcp/auth/register"));

  assert.equal(url.pathname, "/api/mcp/auth/register");
  assert.equal(url.searchParams.get("app"), "calories");
});

test("device authorization form includes the Calories app", () => {
  const form = buildDeviceAuthorizationRequest(
    { scopes: "read:entries write:entries" },
    "test-client-id"
  );

  assert.equal(form.get("app"), "calories");
  assert.equal(form.get("client_id"), "test-client-id");
  assert.equal(form.get("scope"), "read:entries write:entries");
});
