# DirecT protocol specification (v0)

**Broader product status (non-normative):** [status-and-roadmap.md](../STATUS-AND-ROADMAP.md)

Decentralized **data plane** (relays, optional PDS) + **L2 settlement** (token, emissions, governance). This document defines wire formats and cryptography; economics and governance are in `docs/economics/` and `docs/governance/`. For intuition with analogies and worked examples, see `[explanation/tokens-blockchain-and-content.md](../explanation/tokens-blockchain-and-content.md)`.

## 1. Identifiers and hashing

- **Chain ID:** Configured per deployment (L2 testnet/mainnet).
- **Content ID (`cid`):** `cid = "0x" + keccak256(canonical_json(content_body))` (32-byte digest, hex).
- **Event ID (`eid`):** `keccak256(serialize(EventHeader || body_hash))` where `EventHeader` includes `author`, `timestamp`, `nonce`, `prev_eid` (optional causal chain).
- **Address:** EVM address of author (`0x` + 20 bytes), checksummed where displayed.

## 2. Content body (canonical JSON)

Posts and attachments share a canonical serialization (UTF-8, sorted keys, no insignificant whitespace):

```json
{
  "type": "post",
  "schema": "direct.post.v1",
  "text": "Hello DirecT",
  "media": [
    {
      "cid": "0x...",
      "mime": "image/png",
      "size": 12345
    }
  ],
  "reply_to": "0x...",
  "created_at": "2026-04-29T12:00:00Z"
}
```

**Rules:**

- `schema` must be understood by relay for indexing category (post, like, comment, share).
- **Binary blobs** are stored at **content-addressed storage** (IPFS CIDv1 or raw `keccak` reference); JSON only holds pointers + metadata.

## 3. Envelope: signed events

Every publishable event is wrapped:

```json
{
  "event": {
    "header": {
      "author": "0xAuthor...",
      "schema": "direct.post.v1",
      "timestamp": 1714396800,
      "nonce": "uuid-or-monotonic",
      "prev_eid": null
    },
    "body": { "...": "canonical post body matching schema" }
  },
  "signature": "0x...concatenated_EIP712_signature..."
}
```

The `signature` field is the hex string returned by `eth_signTypedData_v4` (same payload as EIP-712 `DirecTEvent` in the reference implementation).

### 3.1 EIP-712 domain (v0)


| Field               | Value                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `name`              | `"DirecT"`                                                                                           |
| `version`           | `"1"`                                                                                                |
| `chainId`           | deployment chain                                                                                     |
| `verifyingContract` | `address(0)` for **portable** author proofs OR a dedicated `Identity` contract address once deployed |


**Typed structure:** `DirecTEvent(bytes32 bodyHash, address author, uint256 timestamp, string nonce, bytes32 prevEid)`  
`bodyHash = keccak256(canonical_json(body))`.

Clients **MUST** use the same canonicalization as relays before signing.

## 4. Relay HTTP API (v0)

Base path: `/v1`.


| Method | Path                          | Description                                                         |
| ------ | ----------------------------- | ------------------------------------------------------------------- |
| `POST` | `/v1/events`                  | Submit signed envelope; relay validates EIP-712 signature.          |
| `GET`  | `/v1/events/:eid`             | Fetch envelope by id.                                               |
| `GET`  | `/v1/feed`                    | Post-only global feed (MVP).                                        |
| `GET`  | `/v1/authors/:address/events` | Author timeline (all event types).                                  |
| `POST` | `/v1/events/:eid/view`        | Increment views (indexer secret optional).                          |
| `GET`  | `/v1/metrics/:eid`            | Engagement counters for a post `eid`.                               |
| `POST` | `/v1/media`                   | `multipart/form-data` field `file` — returns `{ cid, mime, size }`. |
| `GET`  | `/v1/media/:cid`              | Stream uploaded bytes (relay-local MVP).                            |
| `GET`  | `/v1/indexer/snapshot`        | **Indexer only:** header `x-indexer-secret` = `INDEXER_SECRET`. JSON: `events`, `metrics`, public account slice (`handle`, `linkedWallets`, `payoutAddress`, `following`). No password material. |
| `GET`  | `/v1/feed?scope=following`   | Optional `scope=following` with **Bearer** session: posts whose `direct_handle` is in the viewer’s following set. |
| `GET`  | `/v1/rewards/epochs/latest`    | Latest **published** Merkle epoch metadata + `allocations[]` (for claim UI). |
| `GET`  | `/v1/rewards/me`               | **Session:** whether the caller’s linked wallets / `payoutAddress` match an allocation in the latest epoch. |
| `POST` | `/v1/admin/rewards-epochs`    | **Indexer secret:** JSON body `PublishedRewardEpoch` (`id`, `root`, `chainId`, `publishedAtMs`, optional `registerTxHash` / `manifestUrl`, `allocations`). Persists for `/rewards/*` + notifications. |
| `POST` | `/v1/accounts/me/follow`     | **Session:** JSON `{ "handle": "target" }` — asymmetric follow. |
| `DELETE` | `/v1/accounts/me/follow/:handle` | **Session:** unfollow. |
| `GET`  | `/v1/accounts/:handle/followers` | `{ "handles": string[] }`. |
| `GET`  | `/v1/accounts/:handle/following` | `{ "handles": string[] }`. |


### 4.1 Indexer snapshot & epoch ingest

1. **Export:** `curl -H "x-indexer-secret: $SECRET" "$RELAY/v1/indexer/snapshot"` → save as `snapshot.json`.
2. **Build epoch (off-chain):** `contracts/scripts/build-epoch.cjs` + policy file → `epoch-<id>.json` (`root`, `allocations`, …). Uses OpenZeppelin `StandardMerkleTree` (`address`, `uint256`) matching `EmissionsController.claim` leaf hashing.
3. **Register root:** deployer calls `registerRoot` on `EmissionsController` (e.g. `npm run epoch:register -- ../epochs/epoch-m3.json` from `contracts/` with `DEPLOYER_PRIVATE_KEY` and `deployments/baseSepolia.json`).
4. **Publish to relay:** `POST /v1/admin/rewards-epochs` with the same `id`, `root`, `chainId`, `publishedAtMs`, `allocations`, and optional `registerTxHash`. **Users must trust** this payload matches the on-chain root (see deploy docs for manifest / URL conventions).

### Reactions & reshares

- `**direct.reaction.v1`:** `body.type = "reaction"`, `body.reaction` ∈ relay allow-list (e.g. `like`, `dislike`, `empathy`, `anger`, …), `body.reply_to` = parent **post eid**.
- `**direct.share.v1`:** `body.type = "share"`, `body.reply_to` = parent post eid — increments share metrics for routing rewards.
- **Legacy** `body.type = "like"` still maps to `reactions.like`.

**Response codes:** `201` accepted, `400` validation, `409` duplicate `eid`.

## 5. Optional PDS (personal data store)

Users may run or delegate a **PDS** that:

- Stores raw event archive for portability.
- Re-exports same envelope format to relays (`POST /events` fan-out).

PDS is **optional in MVP**; default path is client → relay.

## 6. Interop with settlement layer

- **Rewards:** Indexers compute finalized aggregates → Merkle roots → L2 `EmissionsController` (see [`contracts/README.md`](../../contracts/README.md)).
- **Governance:** Same `author` addresses may hold DIR and vote (see governance doc).

**Live testnet:** Base Sepolia deployment snapshot (token + emissions addresses) is documented in [`../deploy/current-environment.md`](../deploy/current-environment.md).

## 7. Versioning

- Bump `schema` field for incompatible body changes.
- Relays MAY reject unknown `schema` or store opaque blobs without indexing.

