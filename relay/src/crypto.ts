import {
  keccak256,
  stringToHex,
  recoverTypedDataAddress,
  zeroAddress,
  type Hex,
  type Address,
} from "viem";

export type EventHeader = {
  author: Address;
  schema: string;
  timestamp: number;
  nonce: string;
  prev_eid: Hex | null;
};

export type SignedEvent = {
  event: {
    header: EventHeader;
    body: Record<string, unknown>;
  };
  /** EIP-712 typed data signature (`eth_signTypedData_v4`). */
  signature: Hex;
};

/** JSON canonicalization: sorted keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function bodyHash(body: Record<string, unknown>): Hex {
  return keccak256(stringToHex(canonicalJson(body)));
}

export const eip712Domain = (chainId: number) =>
  ({
    name: "DirecT",
    version: "1",
    chainId,
    verifyingContract: zeroAddress,
  }) as const;

export const eip712Types = {
  DirecTEvent: [
    { name: "bodyHash", type: "bytes32" },
    { name: "author", type: "address" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "string" },
    { name: "prevEid", type: "bytes32" },
  ],
} as const;

export function eventMessage(header: EventHeader, body: Record<string, unknown>) {
  return {
    bodyHash: bodyHash(body),
    author: header.author,
    timestamp: BigInt(header.timestamp),
    nonce: header.nonce,
    prevEid: (header.prev_eid ?? (`0x${"0".repeat(64)}` as Hex)) as Hex,
  };
}

export async function verifySignature(chainId: number, envelope: SignedEvent): Promise<Address> {
  const { header, body } = envelope.event;
  const address = await recoverTypedDataAddress({
    domain: eip712Domain(chainId),
    types: eip712Types,
    primaryType: "DirecTEvent",
    message: eventMessage(header, body),
    signature: envelope.signature,
  });
  if (address.toLowerCase() !== header.author.toLowerCase()) {
    throw new Error("Signer does not match author");
  }
  return address;
}

export function computeEid(envelope: SignedEvent): Hex {
  const payload = canonicalJson(envelope.event);
  return keccak256(stringToHex(payload));
}
