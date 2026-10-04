# Messenger receiver

App 1114985494224600; page 116720256838717. Meta page permission approved in browser.

Receiver /api/meta/webhook verifies X-Hub-Signature-256 over original body with META_APP_SECRET, limits body to 256KiB, filters inbound target-page events, ignores echoes, deduplicates by message ID. Incoming records are separate from manager messages and never trigger AI or sends. Audio/attachments are represented by type only, no media downloaded. Owner inbox uses existing authenticated records route.

Not live: META_APP_SECRET and META_VERIFY_TOKEN absent; no page token obtained; no Meta subscriptions configured. Site is owner-private: Meta cannot call it directly. Need an external HTTPS relay that validates Meta signature, forwards exact body/signature with Sites bypass token sent only to this Site, and serves verification using a dedicated verify token. Confirm hosting and secure credential destination before configuring. Do not expose bypass token in webhook URL or share it with Meta. Preserve private Site access.

App review required for non-role Messenger users per Meta setup UI. No automatic replies enabled.
