# V57 payment providers

## Contract inventory (2026-09-02)

The Zarinpal adapter uses the verified official [request/callback/verify contract](https://www.zarinpal.com/docs/paymentGateway/connectToGateway), [IRR currency contract](https://www.zarinpal.com/docs/paymentGateway/moreFeatures/currency) and [sandbox contract](https://www.zarinpal.com/docs/paymentGateway/sandBox). Requests use canonical server-owned IRR amounts. Verification requires code 100 or 101 and a valid reference. No real-money transaction was used for automated verification.

Behpardakht, Saman, Sadad, Iran Kish, Pasargad, Parsian and Asan Pardakht are catalog definitions, **not integrated adapters**. They cannot be enabled, cannot create sessions, and do not collect guessed credential fields. The official Saman documentation page linked a ZIP whose contents could not be inspected with the available fetch path; a third-party/older copy was not substituted. Other official endpoints were unavailable, required access to merchant documentation, or did not expose an inspectable API contract. Adding a definition to the owner's disabled list is not activation.

## Extension boundary

- `provider-catalog.ts`: public metadata and verified field schemas, shared by the owner form and server validation.
- `provider-registry.ts`: explicitly registered, real adapters. Implement the normalized contract in `provider-types.ts`, document its official source and add contract tests before registering another adapter.
- `payment-provider-config.ts`: server-only encrypted vault. AES-256-GCM AAD is `miran-payment-provider:<provider>:v1`. All credential values, including fields classified non-secret, stay in the vault. The browser receives only hints.
- Priority is additive `__meta.priority` inside the existing encrypted JSON document. Existing `{ merchantId }` Zarinpal documents retain their meaning and default priority 100. No migration or re-encryption of production rows runs on deploy/read.
- The owner may enable multiple implemented/configured providers, independently and in priority order. Bank transfer remains separate. Unimplemented definitions are never eligible.

## Payment integrity

New attempt IDs use `v57_` plus a random UUID. Their callback URL carries the exact attempt ID and a constant-time-verified HMAC over provider, attempt, order, amount and currency. Its key material is domain-separated from the configured merchant credentials and sandbox mode; it is not stored in the database. Pending attempts block credential/sandbox rotation with an atomic write guard. A configuration-revision check prevents creating an attempt with stale credentials. Disabling affects new sessions, not verification of pending payments.

The historical Zarinpal callback URL and pre-V57 unsigned attempts remain supported, with server-side verification, provider/amount/order checks and reference replay protection. A new attempt cannot fall back to that unsigned behavior. Redirect query parameters never prove payment success: the result page reads the authenticated customer's persisted order.

The order/attempt/audit settlement batch uses an order compare-and-set followed by `changes()`-guarded writes. Concurrent callbacks cannot pay twice, downgrade paid state, duplicate the paid audit, or consume inventory twice. Payment confirmation retains the existing stock reservation; shipping remains responsible for inventory completion.

Ambiguous verification/network failures retain pending state for reconciliation. The UI must not invite a second charge while a previous issued payment session remains pending in another provider. A creation failure before delivering a redirect can release the failed attempt so a different provider can be selected.

## Operations and limitations

“Available” means the adapter and enabled, decryptable local configuration can start a request; it is not a live bank-connectivity guarantee. The safe owner health check validates configuration only, explicitly reports that scope, audits the action without secrets, and never initiates a payment. No automatic provider health probe, refund, live charge or production configuration change runs during deployment.

Owner authorization plus `security.write`, origin protection and bounded/rate-limited mutations guard configuration APIs. Non-owner managers cannot access credential management, including masked hints. Public capability responses contain only provider IDs, names, priority and sandbox labels.

Keep `PAYMENT_CONFIG_ENCRYPTION_KEY` in the server secret store. A migration backup may preserve existing ciphertext/IV and priority metadata, but the encryption key must be transferred separately through a secure channel. Never place keys, merchant values, database exports or media archives in GitHub or public source artifacts.
