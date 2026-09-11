export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function readJson(req, maxBytes = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, "Request body is too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

export function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
    "cache-control": "no-store"
  });
  res.end(json);
}

export function safeRemoteError(status, payload, fallback) {
  const message = payload?.error_description || payload?.error?.message || payload?.error;
  return new HttpError(status, typeof message === "string" ? message : fallback);
}

export function parseMcpPayload(text, expectedId) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates = [];
  if (trimmed.startsWith("{")) {
    candidates.push(JSON.parse(trimmed));
  } else {
    for (const block of trimmed.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data && data !== "[DONE]") candidates.push(JSON.parse(data));
    }
  }

  return candidates.find((item) => item?.id === expectedId) || candidates.at(-1) || null;
}

export function validateWorkout(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "Workout body must be a JSON object");
  }

  const allowed = new Set([
    "walk", "run", "cycling", "strength", "swimming", "yoga", "sport", "other"
  ]);
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new HttpError(400, "title is required");
  }
  if (typeof input.emoji !== "string" || !input.emoji.trim()) {
    throw new HttpError(400, "emoji is required by add_workout_entry");
  }
  if (input.activity_type !== undefined && !allowed.has(input.activity_type)) {
    throw new HttpError(400, "activity_type is invalid");
  }
  if (input.calories_burned !== undefined &&
      (!Number.isFinite(input.calories_burned) || input.calories_burned < 0)) {
    throw new HttpError(400, "calories_burned must be a non-negative number");
  }
  if (input.event_datetime !== undefined &&
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.event_datetime)) {
    throw new HttpError(400, "event_datetime must be ISO 8601 with a timezone offset");
  }

  const fields = [
    "title", "emoji", "activity_type", "calories_burned", "duration_minutes",
    "distance", "distance_unit", "notes", "event_datetime"
  ];
  return Object.fromEntries(fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

export function validateExternalId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{1,160}$/.test(value)) {
    throw new HttpError(400, "workout key must contain only letters, numbers, :, _ or -");
  }
  return value;
}

export function validateRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new HttpError(400, "revision must be a positive integer");
  }
  return value;
}
