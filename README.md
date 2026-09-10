# Calories Club Node-RED bridge

Een kleine Dockerized Node.js-bridge. Node-RED stuurt een gewone HTTP POST naar
`/workout`; de bridge beheert OAuth Device Authorization, token refresh en de
MCP Streamable HTTP-sessie.

## Home Assistant-app

Deze repository kan ook rechtstreeks als aangepaste app-repository aan Home
Assistant OS of Supervised worden toegevoegd:

```text
https://github.com/Deluka-BE/calories-club-node-red-bridge
```

Open **Instellingen → Apps → App-winkel → Repositories**, voeg de URL toe en
installeer **Calories Club Node-RED Bridge**. De eerste appversie gebruikt poort
`3107` en heeft bewust nog geen Ingress. Volledige instructies staan in
`calories-club-bridge/DOCS.md`.

## Wat is gecontroleerd

Op 10 september 2026 publiceerde Recordo:

- resource: `https://api.recordo.app/api/mcp/calories/mcp`
- scopes: `read:entries write:entries`
- Bearer-authenticatie via de HTTP-header
- grants: Authorization Code, Device Code en Refresh Token
- Dynamic Client Registration
- MCP zonder token: HTTP 401 met `invalid_token`

De registratie zelf wordt pas bij `POST /login` uitgevoerd en kon daarom vooraf
niet zonder neveneffect worden getest. Als Recordo bij Dynamic Client
Registration aanvullende velden vereist, retourneert `/login` de veilige
foutmelding van de server zonder secrets te loggen.

## Installatie

```bash
cp .env.example .env
```

Vervang `BRIDGE_API_KEY` door een lange willekeurige waarde en start:

```bash
docker compose up -d --build
docker compose logs -f calories-club-bridge
```

De API luistert op `http://HOST-IP:3107`. OAuth-state staat persistent in het
Docker-volume `calories-club-auth`, in `/data/auth-state.json` binnen de
container. Dit bestand heeft modus `0600` en wordt niet in het image ingebouwd.

## Status

```bash
curl -sS http://localhost:3107/status \
  -H "X-API-Key: YOUR_BRIDGE_API_KEY"
```

Er worden alleen statusvelden getoond, nooit access tokens, refresh tokens of
client secrets.

## Eerste login

```bash
curl -sS -X POST http://localhost:3107/login \
  -H "X-API-Key: YOUR_BRIDGE_API_KEY"
```

Open de teruggegeven `verification_uri` (of `verification_uri_complete`) en vul
de `user_code` in. Controleer daarna opnieuw `/status`. De bridge pollt op de
achtergrond en bewaart het ontvangen access- en refresh token automatisch.

Bij een herstart wordt een nog lopende Device Code-flow hervat. Een verlopen
access token wordt vóór de volgende MCP-aanroep automatisch vernieuwd.

## Workout testen

Let op: deze opdracht maakt een echte Calories Club-registratie.

```bash
curl -sS -X POST http://localhost:3107/workout \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_BRIDGE_API_KEY" \
  --data '{
    "title": "Overige actieve activiteit",
    "emoji": "🔥",
    "activity_type": "other",
    "calories_burned": 336.21,
    "notes": "Apple Health actieve energie minus geregistreerde workouts",
    "event_datetime": "2026-09-10T23:59:00+02:00"
  }'
```

Ondersteunde optionele workoutvelden zijn `duration_minutes`, `distance` en
`distance_unit` (`km` of `mi`). `event_datetime` moet een timezone bevatten.

## Node-RED

Je hebt alleen een Function-node en een HTTP Request-node nodig.

Function-node vóór de HTTP Request-node:

```javascript
msg.method = "POST";
msg.url = "http://YOUR_DOCKER_HOST:3107/workout";
msg.headers = {
    "content-type": "application/json",
    "x-api-key": env.get("CALORIES_BRIDGE_API_KEY")
};

msg.payload = {
    title: msg.activity.title,
    emoji: msg.activity.emoji || "🔥",
    activity_type: msg.activity.activity_type,
    calories_burned: Number(msg.activity.calories_burned),
    notes: msg.activity.notes || null,
    event_datetime: msg.activity.event_datetime
};

return msg;
```

HTTP Request-node:

- Method: `use msg.method`
- URL: leeg laten; gebruikt `msg.url`
- Return: `a parsed JSON object`
- stuur de uitgang naar een Debug-node

Als Node-RED en de bridge in hetzelfde Docker-netwerk draaien, gebruik dan
`http://calories-club-bridge:3000/workout` in plaats van de hostpoort.

## API-antwoorden

Succes:

```json
{
  "success": true,
  "result": {}
}
```

Niet aangemeld:

```json
{
  "success": false,
  "error": "Bridge is not authorized; call POST /login"
}
```

## Beveiliging

- Publiceer poort 3107 niet op het internet.
- Gebruik `BRIDGE_API_KEY` als de bridge via je LAN bereikbaar is.
- Commit `.env` nooit naar Git.
- Maak geen Debug-node die headers of `/data/auth-state.json` logt.
- Maak regelmatig een beveiligde back-up van het Docker-volume; het bevat een
  refresh token waarmee naar jouw Calories Club-account geschreven kan worden.

## MCP-volgorde

Voor iedere workout voert de bridge uit:

1. verkrijg of vernieuw het OAuth access token;
2. `initialize` met protocolversie `2025-03-26`;
3. lees `Mcp-Session-Id` uit de responseheader;
4. `notifications/initialized` met dezelfde sessie-ID;
5. `tools/call` met exact `add_workout_entry`;
6. bij HTTP 401 eenmaal token vernieuwen en een nieuwe MCP-sessie starten.

De bridge verwerkt zowel gewone JSON- als `text/event-stream`-responses.

## Automatisch publiceren naar GHCR

De workflow `.github/workflows/docker-publish.yml` bouwt en publiceert het image
automatisch voor:

- `linux/amd64`
- `linux/arm64`, waaronder Raspberry Pi 5 met een 64-bits besturingssysteem

Bij iedere push naar `main` wordt gepubliceerd als:

```text
ghcr.io/<github-user>/calories-club-node-red-bridge:latest
```

De gebruikersnaam wordt door de workflow automatisch uit de eigenaar van de
GitHub-repository gehaald en naar kleine letters omgezet.

Een Git-tag zoals `v1.0.0` publiceert deze tags:

```text
ghcr.io/<github-user>/calories-club-node-red-bridge:v1.0.0
ghcr.io/<github-user>/calories-club-node-red-bridge:1.0.0
ghcr.io/<github-user>/calories-club-node-red-bridge:1.0
```

Voorbeeld om een release te publiceren:

```bash
git tag v1.0.0
git push origin v1.0.0
```

De workflow gebruikt uitsluitend de automatisch beschikbare `GITHUB_TOKEN` en
heeft `packages: write`-rechten. Je hoeft geen persoonlijk toegangstoken als
repository secret toe te voegen.

### GHCR-package publiek maken

Nieuwe GHCR-packages kunnen standaard privé zijn. Na de eerste geslaagde
workflow-run:

1. open je GitHub-profiel of organisatie;
2. open **Packages** en kies `calories-club-node-red-bridge`;
3. open **Package settings**;
4. ga naar **Danger Zone** en **Change package visibility**;
5. kies **Public** en bevestig de pakketnaam.

Daarna kan Portainer het image zonder registry-login downloaden. Als je het
package privé laat, voeg je in Portainer eerst `ghcr.io` als registry toe met
een GitHub Personal Access Token dat minimaal `read:packages` heeft.

## Portainer

### Stack aanmaken

1. Open **Stacks** → **Add stack**.
2. Geef de stack bijvoorbeeld de naam `calories-club`.
3. Kies **Web editor**.
4. Plak onderstaande stack en vervang `<github-user>` door je GitHub-gebruikersnaam
   in kleine letters.
5. Vervang `JOUW_LANGE_API_KEY` door een lange willekeurige waarde.
6. Klik **Deploy the stack**.

```yaml
services:
  calories-club-bridge:
    image: ghcr.io/<github-user>/calories-club-node-red-bridge:latest
    container_name: calories-club-bridge
    restart: unless-stopped
    ports:
      - "3107:3000"
    environment:
      BRIDGE_API_KEY: "JOUW_LANGE_API_KEY"
    volumes:
      - calories-club-auth:/data

volumes:
  calories-club-auth:
```

Portainer detecteert op een Raspberry Pi 5 automatisch de `linux/arm64`-variant.
Controleer na de deployment onder **Containers** →
`calories-club-bridge` → **Logs** of de bridge op poort 3000 luistert.

Test vanaf een toestel op hetzelfde netwerk:

```bash
curl -sS http://RPI-IP:3107/status \
  -H "X-API-Key: JOUW_LANGE_API_KEY"
```

Start vervolgens eenmalig de OAuth-login:

```bash
curl -sS -X POST http://RPI-IP:3107/login \
  -H "X-API-Key: JOUW_LANGE_API_KEY"
```

### Bijwerken vanuit Portainer

Na een nieuwe publicatie van `latest`:

1. open de stack;
2. kies **Editor**;
3. activeer **Re-pull image and redeploy** als die optie zichtbaar is;
4. kies **Update the stack**.

Het volume `calories-club-auth` blijft bestaan, zodat de OAuth-login en refresh
token behouden blijven wanneer de container of het image wordt vervangen.
