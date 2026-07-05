# Parent Manager

A free, local-first co-parenting dashboard inspired by tools like MyFamilyWizard.

## What it does

- Saves reminders for exchanges, school, medical items, expenses, and schedule changes.
- Generates neutral co-parenting message drafts from plain facts.
- Opens WhatsApp with the message text ready to send.
- Stores a co-parent profile locally in your browser.
- Stores agreements and a communication log in browser `localStorage`.
- Exports and imports your data as JSON.

## WhatsApp note

Free personal WhatsApp and WhatsApp Communities do not provide reliable auto-posting for third-party apps. This MVP uses WhatsApp share links so you can send prepared messages manually. A later hosted version could integrate WhatsApp Business Cloud API for supported one-to-one message templates, but Community automation is still limited.

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```
