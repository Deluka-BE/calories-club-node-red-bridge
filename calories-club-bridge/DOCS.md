# Calories Club Node-RED Bridge

Deze Home Assistant-app beheert OAuth, tokenvernieuwing en MCP-sessies voor
Calories Club. Node-RED hoeft alleen gewone HTTP-verzoeken te versturen.

## Configuratie

Vul bij **Configuratie** een willekeurige API-key van minstens 16 tekens in.
Bewaar diezelfde waarde veilig in Node-RED.

De OAuth-state wordt persistent opgeslagen in `/data/auth-state.json` en wordt
meegenomen in Home Assistant-back-ups. Tokens worden nooit in de app-log getoond.

## Eerste login

Start de app en voer vanaf een toestel op hetzelfde netwerk uit:

```bash
curl -sS -X POST http://HOME_ASSISTANT_IP:3107/login \
  -H "X-API-Key: JOUW_LANGE_API_KEY"
```

Open de teruggegeven `verification_uri`, vul de `user_code` in en controleer:

```bash
curl -sS http://HOME_ASSISTANT_IP:3107/status \
  -H "X-API-Key: JOUW_LANGE_API_KEY"
```

## Node-RED

Gebruik voorlopig de hostpoort, ook vanuit de Node-RED-app:

```text
http://HOME_ASSISTANT_IP:3107/workout
```

Stuur `X-API-Key` mee en gebruik een JSON-body. De contracten van `/status`,
`/login` en `/workout` zijn identiek aan die van de Dockerbridge.

Ingress is nog niet ingeschakeld in deze eerste versie.
