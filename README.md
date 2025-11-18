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

