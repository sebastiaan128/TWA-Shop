# TWA Shop Discord Bot

Een eenvoudige Discord bot setup met slash commands.

## Vereisten
- Node.js >= 18.17
- Een Discord application (client id) + bot token
- Guild ID waarin je de commands wilt gebruiken

## Configuratie
Maak/gebruik `.env`:
```
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_GUILD_ID=...
ROLE_ID_TO_ASSIGN=...
```

Nooit je secrets committen buiten private repo.

## Installatie
```bash
npm install
```

## Commands deployen
```bash
npm run deploy:commands
```

## Starten bot
```bash
npm start
```
Of met watch:
```bash
npm run dev
```

## Toegevoegde commands
- `/ping` latency test
- `/role` geeft een vaste role aan de gebruiker

## Extra ideeën
- Logging kanaal
- `/help`
- Automatische welkomstberichten

## Problemen oplossen
- Zorg dat de bot nodig intents heeft in Developer Portal (MESSAGE CONTENT aanzetten indien nodig).
- Controleer dat de role ID bestaat binnen de ingestelde guild.
- Nadat je een command wijzigt: opnieuw `npm run deploy:commands`.


## Railway Hobby / CoC-proxy

Gebruik `npm start`, één replica en geen App Sleep. Zet `DEPLOY_SYNC=0` om het
oude hosting-specifieke postinstall-script uit te schakelen. Verwijder de
variabele `HEALTHCHECK` voor een blijvend draaiende bot: elke ingestelde waarde
activeert de eenmalige logincontrole en laat het proces daarna stoppen.

Voor de rechtstreekse CoC-clancontrole bij reviews kan de expliciet gekozen
RoyaleAPI-proxy worden gebruikt:

```text
COC_API_BASE_URL=https://cocproxy.royaleapi.dev/v1
COC_API_TOKEN=<CoC-key met toegestaan IP 45.79.218.79>
```

Zet dezelfde endpointinstelling lokaal om via dezelfde route te testen, zonder
je thuis-IP toe te voegen. De CoC-sleutel en aanvragen gaan via RoyaleAPI; zie
https://docs.royaleapi.com/proxy. Zonder `COC_API_BASE_URL` blijft de officiële
API de default, met de gebruikelijke IP-beperking. Onbekende endpoints en
redirects worden geweigerd. Gebruik `npm test` voor tests zonder Discord-login.

CoC-verbinding alleen-lezen controleren: `npm run check:coc`. Dit vraagt één
clan op, controleert het antwoord en toont geen secrets of Discord-berichten.
Met `COC_CHECK_CLAN_TAG` kan een andere clantag worden gekozen.
