# Global Search Performance Design

## Goal

Return useful global message-search results quickly on Android and Web while preserving end-to-end encryption, and ensure every returned result can map back to its rendered message.

## Chosen Approach

Search already-loaded rendered messages synchronously, then scan only missing remote history with a four-session concurrency cap. Publish matches after the loaded pass and after every decrypted remote page so the UI becomes useful before the full scan finishes. Do not persist plaintext indexes.

## Identity Contract

Search results use `NormalizedMessage.id` and `NormalizedMessage.createdAt`, not the outer encrypted `ApiMessage` identity. These are the same values propagated by the reducer into `Message.sourceMessageId` and `Message.createdAt`, so `loadSearchResult` can recover a clicked result.

## Data Flow

1. Normalize the query once.
2. Search each loaded session's visible user/agent text and publish deduplicated, newest-first matches immediately.
3. Skip remote work when a loaded session has no older pages.
4. For partially loaded sessions, start before the oldest loaded raw sequence; for unloaded sessions, start at the latest page.
5. Run at most four session scans concurrently. Each page updates aggregate progress and publishes new matches.
6. Stop scheduling/fetching when cancelled or when the global 200-result limit is reached.

## Error Handling

One session's fetch/decrypt failure does not discard successful results from other sessions. User cancellation stops new pages without showing an error. Existing jump failure UI remains the terminal fallback for genuinely unavailable messages.

## Verification

- Unit test normalized inner identity and timestamp mapping.
- Unit test loaded-message search, thinking exclusion, and deduplication.
- Unit test the four-worker concurrency helper never exceeds its cap and preserves output order.
- Run the full Happy App test suite, typecheck, production Web smoke test, and local Android release build.
